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

async function notifyRemediator(
  remediationId: string,
  action: "approve" | "reject",
): Promise<void> {
  const base = process.env.BLACKGLASS_REMEDIATOR_BASE_URL?.trim();
  if (!base) return;
  const token = process.env.BLACKGLASS_REMEDIATOR_TOKEN?.trim();
  try {
    await fetch(`${base.replace(/\/$/, "")}/api/v1/remediations/${remediationId}/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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

  void notifyRemediator(id, action);

  return NextResponse.json({ ok: true, remediation: updated });
}
