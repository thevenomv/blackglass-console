/**
 * POST /api/remediations/callback
 *
 * Receives recommendation status updates from blackglass-remediator.
 * Verifies the X-Blackglass-Signature HMAC header (sha256, hex) using the
 * BLACKGLASS_REMEDIATOR_SECRET env var so only the trusted remediator
 * service can write to the recommendations table.
 *
 * Payload (matches the remediator's POST body):
 *   {
 *     remediation_id: string (ULID),
 *     tenant_id: string (uuid),
 *     status: "draft" | "awaiting_approval" | "approved" | "rejected" | "expired",
 *     risk_policy_tier: string,
 *     summary: string,
 *     plan: object,
 *     drift_event_id?: string,
 *     host_id?: string,
 *     scan_id?: string
 *   }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { upsertRemediation } from "@/lib/server/services/remediation-service";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";

const BodySchema = z.object({
  remediation_id: z.string().min(1).max(64),
  tenant_id: z.string().uuid(),
  status: z.enum(["draft", "awaiting_approval", "approved", "rejected", "expired"]),
  risk_policy_tier: z.string().min(1).max(64),
  summary: z.string().min(1).max(2000),
  plan: z.record(z.string(), z.unknown()),
  drift_event_id: z.string().max(64).optional(),
  host_id: z.string().max(64).optional(),
  scan_id: z.string().max(64).optional(),
});

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.BLACKGLASS_REMEDIATOR_SECRET?.trim();
  // No secret configured → accept (development mode); production must set it.
  if (!secret) return true;
  if (!signature) return false;

  const provided = signature.replace(/^sha256=/, "");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  const rawBody = await request.text();
  const sig = request.headers.get("x-blackglass-signature");
  if (!verifySignature(rawBody, sig)) {
    return jsonError(401, "invalid_signature", "HMAC signature mismatch.", requestId);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return jsonError(400, "invalid_json", "Body is not valid JSON.", requestId);
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(400, "validation_error", parsed.error.message, requestId);
  }

  try {
    const view = await upsertRemediation({
      tenantId: parsed.data.tenant_id,
      remediationId: parsed.data.remediation_id,
      driftEventId: parsed.data.drift_event_id,
      hostId: parsed.data.host_id,
      scanId: parsed.data.scan_id,
      status: parsed.data.status,
      riskPolicyTier: parsed.data.risk_policy_tier,
      summary: parsed.data.summary,
      plan: parsed.data.plan,
    });
    return NextResponse.json({ ok: true, remediation: view });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[remediations/callback] persist failed:", msg);
    return jsonError(500, "persist_failed", msg, requestId);
  }
}
