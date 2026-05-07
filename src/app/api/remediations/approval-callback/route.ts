/**
 * POST /api/remediations/approval-callback
 *
 * Receives final approval-state confirmations from the remediator after a
 * BLACKGLASS-initiated approve/reject action.  Same HMAC scheme as
 * /api/remediations/callback.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { setRemediationStatus } from "@/lib/server/services/remediation-service";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";

const BodySchema = z.object({
  remediation_id: z.string().min(1).max(64),
  tenant_id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "expired"]),
  /** Optional final outcome message — currently logged only. */
  outcome: z.string().max(2000).optional(),
});

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.BLACKGLASS_REMEDIATOR_SECRET?.trim();
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
    const updated = await setRemediationStatus(
      parsed.data.tenant_id,
      parsed.data.remediation_id,
      parsed.data.status,
      "remediator-callback",
    );
    if (!updated) {
      return jsonError(404, "not_found", "Remediation not found.", requestId);
    }
    if (parsed.data.outcome) {
      console.info(
        `[remediations/approval-callback] ${parsed.data.remediation_id} -> ${parsed.data.status}: ${parsed.data.outcome}`,
      );
    }
    return NextResponse.json({ ok: true, remediation: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[remediations/approval-callback] persist failed:", msg);
    return jsonError(500, "persist_failed", msg, requestId);
  }
}
