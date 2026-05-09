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
type NotifyResult =
  | { kind: "no_remediator" }
  | { kind: "ok" }
  | { kind: "upstream_error"; status: number; detail: string }
  | { kind: "transport_error"; detail: string };

/**
 * Forward the operator's decision to the remediator.
 *
 * Returns a discriminated result so the caller can fail loud when the
 * sidecar didn't accept the decision — remediation is binary (it
 * either triggered or it didn't) and a 200 here while the sidecar
 * never received the approval would be an immediate trust-breaker.
 *
 * `no_remediator` is the explicit "remediator service is intentionally
 * not configured" case — only this is treated as success-without-notify.
 */
async function notifyRemediator(
  remediationId: string,
  action: "approve" | "reject",
  ctx: { tenantId: string; actorId: string },
): Promise<NotifyResult> {
  const base = process.env.BLACKGLASS_REMEDIATOR_BASE_URL?.trim();
  if (!base) return { kind: "no_remediator" };
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
    const res = await fetch(
      `${base.replace(/\/$/, "")}/api/v1/remediations/${remediationId}/${action}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(approvalToken ? { "X-Blackglass-Approval-Token": approvalToken } : {}),
        },
        body: JSON.stringify({
          actor_id: ctx.actorId,
          tenant_id: ctx.tenantId,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        kind: "upstream_error",
        status: res.status,
        detail: body.slice(0, 200) || `HTTP ${res.status}`,
      };
    }
    return { kind: "ok" };
  } catch (err) {
    return {
      kind: "transport_error",
      detail: err instanceof Error ? err.message : String(err),
    };
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

  // Remediation is binary — it triggered or it didn't. We MUST surface
  // upstream sidecar failures to the operator instead of returning 200
  // and silently dropping the approval. The DB row stays in the chosen
  // status so the operator can retry the action; a follow-up POST is
  // idempotent at the sidecar (it dedups on recommendation_id).
  const notify = await notifyRemediator(id, action, {
    tenantId: access.ctx.tenant.id,
    actorId: access.ctx.userId,
  });

  if (notify.kind === "upstream_error") {
    console.error(
      `[remediations/${action}] sidecar rejected decision id=${id} status=${notify.status}`,
    );
    return jsonError(
      502,
      "remediator_upstream_error",
      `Decision was recorded locally but the remediator service rejected it (HTTP ${notify.status}). Retry the action once the sidecar is healthy.`,
      requestId,
    );
  }
  if (notify.kind === "transport_error") {
    console.error(
      `[remediations/${action}] sidecar transport failure id=${id}: ${notify.detail}`,
    );
    return jsonError(
      502,
      "remediator_unreachable",
      "Decision was recorded locally but the remediator service was unreachable. Verify BLACKGLASS_REMEDIATOR_BASE_URL and retry.",
      requestId,
    );
  }

  return NextResponse.json({
    ok: true,
    remediation: updated,
    notified: notify.kind === "ok",
    requestId,
  });
}
