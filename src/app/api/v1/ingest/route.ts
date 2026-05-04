/**
 * POST /api/v1/ingest
 *
 * Push-agent ingestion endpoint.  Instead of BLACKGLASS SSH-ing into a host
 * (pull model), a lightweight agent installed on the host collects the same
 * data locally and pushes it here over HTTPS.
 *
 * Authentication:
 *   - `INGEST_API_KEY` — shared Bearer secret (default).
 *   - Optional `INGEST_HOST_KEYS_JSON` — `{"hostId":"per-host-secret",...}`; when set for a
 *     `hostId`, the Bearer must match that host's secret (falls back to `INGEST_API_KEY` for
 *     hosts not listed).
 *
 * Payload: IngestPayloadSchema (see src/lib/server/http/schemas.ts)
 */

import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { saveBaseline } from "@/lib/server/baseline-store";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { IngestPayloadSchema } from "@/lib/server/http/schemas";
import { checkIngestRate } from "@/lib/server/rate-limit";
import { revalidateIntegritySurfaces } from "@/lib/server/integrity-revalidate";
import { listBaselineHostIds } from "@/lib/server/baseline-store";
import { withinHostAllowance } from "@/lib/saas/operations";
import { getSubscriptionForTenant } from "@/lib/saas/tenant-service";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";

export const dynamic = "force-dynamic";

function parseHostIngestKeys(): Record<string, string> {
  const raw = process.env.INGEST_HOST_KEYS_JSON?.trim();
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && v.length > 0) out[String(k)] = v;
    }
    return out;
  } catch {
    console.warn("[ingest] INGEST_HOST_KEYS_JSON parse failed");
    return {};
  }
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const apiKey = process.env.INGEST_API_KEY?.trim();
  const hostKeyMap = parseHostIngestKeys();
  if (!apiKey && Object.keys(hostKeyMap).length === 0) {
    console.warn("[ingest] INGEST_API_KEY / INGEST_HOST_KEYS_JSON not configured — endpoint disabled");
    return jsonError(503, "not_configured", "Push ingestion is not configured on this instance", requestId);
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = IngestPayloadSchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const snapshot = parsed.data;

  const authHeader = request.headers.get("authorization") ?? "";
  const providedKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  const { timingSafeEqual } = await import("node:crypto");
  const enc = (s: string) => Buffer.from(s, "utf8");
  const matchKey = (expected: string) =>
    providedKey.length === expected.length && timingSafeEqual(enc(providedKey), enc(expected));

  const perHost = hostKeyMap[snapshot.hostId];
  let authed = false;
  if (perHost) {
    authed = matchKey(perHost);
  } else if (apiKey) {
    authed = matchKey(apiKey);
  }

  if (!authed) {
    return jsonError(401, "unauthorized", "Invalid or missing Bearer token", requestId);
  }

  const ingestTenantId = process.env.INGEST_SAAS_TENANT_ID?.trim();
  if (ingestTenantId) {
    const { tryGetDb } = await import("@/db");
    if (!tryGetDb()) {
      return jsonError(503, "database_unavailable", "Tenant-scoped ingest requires DATABASE_URL", requestId);
    }
    const sub = await getSubscriptionForTenant(ingestTenantId);
    if (!sub) {
      return jsonError(403, "ingest_scope_invalid", "INGEST_SAAS_TENANT_ID does not match a tenant", requestId);
    }
    const baselineIds = await listBaselineHostIds();
    const known = new Set(baselineIds);
    const isNewHost = !known.has(snapshot.hostId);
    const gate = withinHostAllowance(sub, known.size, isNewHost ? 1 : 0);
    if (!gate.ok) {
      return jsonError(403, gate.code, gate.detail, requestId);
    }
  }

  if (!(await checkIngestRate(snapshot.hostId))) {
    return jsonError(429, "rate_limited", `Ingest rate limit exceeded for host ${snapshot.hostId}`, requestId);
  }

  try {
    await saveBaseline(snapshot);
  } catch (err) {
    console.error("[ingest] Failed to save snapshot for host", snapshot.hostId, ":", err);
    return jsonError(502, "store_error", "Snapshot could not be persisted. Check server logs.", requestId);
  }

  appendAudit({
    action: AUDIT_ACTIONS.BASELINE_CAPTURE,
    detail: `Push-agent ingest — host=${snapshot.hostId} hostname=${snapshot.hostname}`,
    actor: snapshot.hostId,
    request_id: requestId,
  });

  revalidateIntegritySurfaces();

  return jsonWithRequestId(
    {
      ok: true,
      hostId: snapshot.hostId,
      capturedAt: snapshot.collectedAt,
    },
    requestId,
  );
}
