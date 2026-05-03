/**
 * POST /api/v1/collector/keys/rotate
 *
 * Placeholder for collector API-key rotation. When a real key store is
 * implemented (Doppler, Infisical, or a DB secrets table), this handler should:
 *   1. Generate a new secure random key.
 *   2. Persist the new key to the secrets backend.
 *   3. Return the new key (redacted after first display) to the caller.
 *   4. Append an audit event.
 */

import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { jsonError } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import { checkCheckoutRate, clientIp } from "@/lib/server/rate-limit";
import { NextResponse } from "next/server";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireSaasStepUpMutation } from "@/lib/server/http/saas-access";
import { canRotateSecretsForTenant } from "@/lib/saas/operations";
import { emitSaasAudit } from "@/lib/saas/event-log";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await checkCheckoutRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many rotation requests.");
  }

  if (isClerkAuthEnabled()) {
    const m = await requireSaasStepUpMutation("secrets.manage", canRotateSecretsForTenant);
    if (!m.ok) return m.response;
    appendAudit({
      action: AUDIT_ACTIONS.KEY_ROTATED,
      detail: "Collector API key rotation requested (stub — SaaS step-up verified)",
      actor: m.ctx.userId,
    });
    void emitSaasAudit({
      tenantId: m.ctx.tenant.id,
      actorUserId: m.ctx.userId,
      action: "secrets.collector_rotate_requested",
      metadata: { stub: true },
    });
  } else {
    const guard = await requireRole(["operator", "admin"]);
    if (!guard.ok) return guard.response;
    appendAudit({
      action: AUDIT_ACTIONS.KEY_ROTATED,
      detail: "Collector API key rotation requested (stub — no persistent key store configured yet)",
      actor: guard.role,
    });
  }

  return NextResponse.json({
    rotated: true,
    message: "Key rotation noted in audit log. Connect a secrets backend to enable real rotation.",
  });
}
