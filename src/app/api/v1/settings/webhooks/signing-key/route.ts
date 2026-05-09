/**
 * GET  /api/v1/settings/webhooks/signing-key
 *   Returns the current signing-key status for the tenant — fingerprint
 *   only, never the raw key. Safe to render in the UI.
 *
 * POST /api/v1/settings/webhooks/signing-key
 *   Rotates the signing key. Slides the old current key into the previous
 *   slot (kept valid for ROTATION_OVERLAP_HOURS), mints a new current key,
 *   and returns it ONCE in the response. After this call the raw key is
 *   unrecoverable; clients must store it server-side or immediately
 *   distribute it to receivers.
 *
 * Both routes require `settings.write` (admin only). RLS enforces tenant
 * isolation at the DB layer — the rotation endpoint cannot accidentally
 * touch another tenant's row even if the route handler is buggy.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import {
  getSigningKeyStatus,
  rotateTenantSigningKey,
} from "@/lib/server/services/notifications-service";
import { emitSaasAudit } from "@/lib/saas/event-log";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(
      400,
      "not_supported",
      "Per-tenant signing keys require SaaS mode (use WEBHOOK_SECRET in legacy mode).",
      requestId,
    );
  }

  const status = await getSigningKeyStatus(access.ctx.tenant.id);
  return NextResponse.json({ status, requestId });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  // Rotation is a privileged mutation; rate-limit on the same bucket as the
  // scan POST since both are infrequent admin operations.
  if (!(await checkScanPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(
      400,
      "not_supported",
      "Per-tenant signing keys require SaaS mode (use WEBHOOK_SECRET in legacy mode).",
      requestId,
    );
  }

  let result: { newKey: string; fingerprint: string; rotatedAt: string };
  try {
    result = await rotateTenantSigningKey(access.ctx.tenant.id);
  } catch (err) {
    // Don't echo the underlying error — rotation can leak DB / KMS
    // internals. Operators get the full stack in the server log.
    console.error(
      "[webhooks/signing-key] rotation failed:",
      err instanceof Error ? err.stack ?? err.message : err,
    );
    return jsonError(
      500,
      "rotation_failed",
      "Webhook signing key rotation failed. Check console logs.",
      requestId,
    );
  }

  // Audit the rotation, NOT the key itself. Even the fingerprint stays out
  // of the audit log to avoid building a rotation-history sidechannel.
  appendAudit({
    action: AUDIT_ACTIONS.WEBHOOK_SIGNING_KEY_ROTATED,
    actor: access.ctx.userId,
    detail: `Webhook signing key rotated for tenant ${access.ctx.tenant.id}`,
  });
  void emitSaasAudit({
    tenantId: access.ctx.tenant.id,
    actorUserId: access.ctx.userId,
    action: "webhook.signing_key_rotated",
    metadata: { rotatedAt: result.rotatedAt, fingerprint: result.fingerprint },
  });

  return NextResponse.json(
    {
      newKey: result.newKey,
      fingerprint: result.fingerprint,
      rotatedAt: result.rotatedAt,
      requestId,
      // Surface the overlap window to the client so the toast can show the
      // operator how long the previous key remains valid.
      overlapHours: Number(process.env.ROTATION_OVERLAP_HOURS ?? 24),
    },
    { status: 201 },
  );
}
