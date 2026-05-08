/**
 * POST /api/v1/remediations/[id]/approve
 * POST /api/v1/remediations/[id]/reject
 *
 * Operator decision endpoints — the chosen action is forwarded to the
 * remediator service which then drives any downstream execution.  We never
 * execute commands ourselves.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import { setRemediationStatus } from "@/lib/server/services/remediation-service";
import { emitSaasAudit } from "@/lib/saas/event-log";
import {
  approvalTokensConfigured,
  signApprovalToken,
} from "@/lib/server/remediator/approval-token";

/**
 * Forward the operator's decision to the remediator.
 *
 * When `REMEDIATOR_APPROVAL_TOKEN_SECRET` is configured the call also
 * carries an `X-Blackglass-Approval-Token` header — a short-lived
 * HMAC-SHA256 token that binds the decision to {recommendation_id,
 * tenant_id, decision, actor_id, exp}. The remediator MUST verify the
 * token with the shared secret before acting on the decision; this
 * way a leaked remediator API key alone is insufficient to fabricate
 * approvals. See src/lib/server/remediator/approval-token.ts.
 */
async function notifyRemediator(
  remediationId: string,
  action: "approve" | "reject",
  ctx: { tenantId: string; actorId: string },
): Promise<void> {
  const base = process.env.BLACKGLASS_REMEDIATOR_BASE_URL?.trim();
  if (!base) return;
  const token = process.env.BLACKGLASS_REMEDIATOR_TOKEN?.trim();

  let approvalToken: string | null = null;
  if (approvalTokensConfigured()) {
    try {
      approvalToken = signApprovalToken({
        recommendationId: remediationId,
        tenantId: ctx.tenantId,
        decision: action,
        actorId: ctx.actorId,
      });
    } catch (err) {
      // Misconfigured secret — log and continue without the token.
      // The remediator is responsible for rejecting unsigned approvals
      // when it has been told to enforce them; absence of the token
      // means it falls back to legacy "trust the API key alone" mode.
      console.error(`[remediations/${action}] failed to mint approval token:`, err);
    }
  }

  try {
    await fetch(`${base.replace(/\/$/, "")}/api/v1/remediations/${remediationId}/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(approvalToken ? { "X-Blackglass-Approval-Token": approvalToken } : {}),
      },
      body: JSON.stringify({
        actor_id: ctx.actorId,
        // The remediator already has the tenant on the recommendation
        // record — we send it again so it can cross-check the
        // approval token without a DB lookup.
        tenant_id: ctx.tenantId,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error(`[remediations/${action}] remediator notify failed:`, err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  const { id, action } = await params;

  if (action !== "approve" && action !== "reject") {
    return jsonError(404, "not_found", "Unknown remediation action.", requestId);
  }
  if (!id || id.length > 64) {
    return jsonError(400, "invalid_id", "Invalid remediation id.", requestId);
  }

  if (!(await checkScanPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission(
    "drift.manage",
    ["operator", "admin"],
  );
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(400, "not_supported", "Remediations require SaaS mode.", requestId);
  }

  const newStatus = action === "approve" ? "approved" : "rejected";
  const updated = await setRemediationStatus(
    access.ctx.tenant.id,
    id,
    newStatus,
    access.ctx.userId,
  );
  if (!updated) {
    return jsonError(404, "not_found", "Remediation not found.", requestId);
  }

  void emitSaasAudit({
    tenantId: access.ctx.tenant.id,
    actorUserId: access.ctx.userId,
    action: action === "approve" ? "remediation.approved" : "remediation.rejected",
    targetType: "remediation",
    targetId: id,
    metadata: { request_id: requestId, status: newStatus },
  });

  void notifyRemediator(id, action, {
    tenantId: access.ctx.tenant.id,
    actorId: access.ctx.userId,
  });

  return NextResponse.json({ ok: true, remediation: updated });
}
