/**
 * POST /api/v1/collector/keys/rotate
 *
 * Issues a new push-ingest API key (`INGEST_API_KEY`). The server cannot update your
 * deployment environment — copy the returned `api_key`, set `INGEST_API_KEY` (or your
 * secrets manager entry), and restart. Until then, the previous key remains valid.
 */

import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { jsonError } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import { checkKeyRotateRate, clientIp } from "@/lib/server/rate-limit";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireSaasStepUpMutation } from "@/lib/server/http/saas-access";
import { canRotateSecretsForTenant } from "@/lib/saas/operations";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { applySaasSentryContext } from "@/lib/observability/sentry-saas";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { generateIngestApiKey } from "@/lib/server/ingest-credentials";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkKeyRotateRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many rotation requests.", requestId);
  }

  if (isClerkAuthEnabled()) {
    const m = await requireSaasStepUpMutation("secrets.manage", canRotateSecretsForTenant);
    if (!m.ok) return m.response;
    void applySaasSentryContext({
      requestId,
      tenantId: m.ctx.tenant.id,
      userId: m.ctx.userId,
      clerkOrgId: m.ctx.tenant.clerkOrgId,
      plan: m.ctx.subscription.planCode,
    });
    appendAudit({
      action: AUDIT_ACTIONS.KEY_ROTATED,
      detail: "Push ingest API key issued — operator must set INGEST_API_KEY and restart",
      actor: m.ctx.userId,
      request_id: requestId,
    });
    void emitSaasAudit({
      tenantId: m.ctx.tenant.id,
      actorUserId: m.ctx.userId,
      action: "secrets.collector_rotate_requested",
      metadata: { request_id: requestId },
    });
  } else {
    const guard = await requireRole(["operator", "admin"]);
    if (!guard.ok) return guard.response;
    appendAudit({
      action: AUDIT_ACTIONS.KEY_ROTATED,
      detail: "Push ingest API key issued — operator must set INGEST_API_KEY and restart",
      actor: guard.role,
      request_id: requestId,
    });
  }

  const newKey = generateIngestApiKey();

  return jsonWithRequestId(
    {
      rotated: true,
      api_key: newKey,
      detail:
        "Copy this key now — it will not be shown again. Set INGEST_API_KEY in your environment or secrets manager and restart the app. Old keys work until replaced.",
    },
    requestId,
  );
}
