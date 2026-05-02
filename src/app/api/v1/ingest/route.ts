/**
 * POST /api/v1/ingest
 *
 * Push-agent ingestion endpoint.  Instead of BLACKGLASS SSH-ing into a host
 * (pull model), a lightweight agent installed on the host collects the same
 * data locally and pushes it here over HTTPS.
 *
 * This solves the "inbound firewall" problem for enterprise customers whose
 * servers live inside strict VPCs or zero-trust networks.
 *
 * Authentication:
 *   The agent authenticates with a shared bearer token set via the
 *   INGEST_API_KEY environment variable.  Each host should have its own key;
 *   rotate via Doppler or the secrets manager you already use.
 *
 * Payload: IngestPayloadSchema (see src/lib/server/http/schemas.ts)
 *
 * Future work:
 *   - Per-host INGEST_API_KEY_<HOST_ID> to limit blast radius of a
 *     compromised key.
 *   - mTLS for managed-certificate zero-trust environments.
 */

import { NextResponse } from "next/server";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { saveBaseline } from "@/lib/server/baseline-store";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { IngestPayloadSchema } from "@/lib/server/http/schemas";
import { checkIngestRate } from "@/lib/server/rate-limit";
import { revalidateIntegritySurfaces } from "@/lib/server/integrity-revalidate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // ------------------------------------------------------------------
  // Bearer token authentication — required in all environments.
  // INGEST_API_KEY must be set before enabling the agent push workflow.
  // ------------------------------------------------------------------
  const apiKey = process.env.INGEST_API_KEY?.trim();
  if (!apiKey) {
    // Not yet configured — reject with 503 rather than 401 so operators
    // know they need to set the env var, not fix their token.
    console.warn("[ingest] INGEST_API_KEY is not set — endpoint is disabled");
    return jsonError(503, "not_configured", "Push ingestion is not configured on this instance");
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const providedKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  // Constant-time comparison to prevent timing side-channels.
  const { timingSafeEqual } = await import("node:crypto");
  const enc = (s: string) => Buffer.from(s, "utf8");
  const keysMatch =
    providedKey.length === apiKey.length &&
    timingSafeEqual(enc(providedKey), enc(apiKey));

  if (!keysMatch) {
    return jsonError(401, "unauthorized", "Invalid or missing Bearer token");
  }

  // ------------------------------------------------------------------
  // Parse + validate payload (needed before rate-limit so we have hostId)
  // ------------------------------------------------------------------
  const raw = await readJsonBodyOptional(request);
  if (!raw.ok) return raw.response;

  const parsed = IngestPayloadSchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const snapshot = parsed.data;

  // Rate-limit per host_id to prevent a misbehaving or compromised agent from
  // flooding the store. 120 calls/min = 2/s sustained, which is well above any
  // real collection cadence.
  if (!(await checkIngestRate(snapshot.hostId))) {
    return jsonError(429, "rate_limited", `Ingest rate limit exceeded for host ${snapshot.hostId}`);
  }

  // ------------------------------------------------------------------
  // Persist as a baseline (same store as SSH-collected snapshots)
  // ------------------------------------------------------------------
  try {
    await saveBaseline(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ingest] Failed to save snapshot:", err);
    return jsonError(502, "store_error", `Failed to persist snapshot: ${msg}`);
  }

  appendAudit({
    action: AUDIT_ACTIONS.BASELINE_CAPTURE,
    detail: `Push-agent ingest — host=${snapshot.hostId} hostname=${snapshot.hostname}`,
    actor: snapshot.hostId,
  });

  // Invalidate cached SSR pages so the dashboard reflects the new data.
  revalidateIntegritySurfaces();

  return NextResponse.json({
    ok: true,
    hostId: snapshot.hostId,
    capturedAt: snapshot.collectedAt,
  });
}
