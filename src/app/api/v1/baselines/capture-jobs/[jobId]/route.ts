/**
 * GET /api/v1/baselines/capture-jobs/:jobId
 * Poll async baseline capture started by POST /api/v1/baselines (202).
 */

import { requireRole } from "@/lib/server/http/auth-guard";
import { jsonError } from "@/lib/server/http/json-error";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireSaasOperationalMutation } from "@/lib/server/http/saas-access";
import { canModifyBaselinesForTenant } from "@/lib/saas/operations";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { getBaselineJobRowBypass } from "@/lib/server/services/baseline-capture-async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  const { jobId } = await params;

  if (isClerkAuthEnabled()) {
    const m = await requireSaasOperationalMutation("baselines.manage", canModifyBaselinesForTenant);
    if (!m.ok) return m.response;
    const row = await getBaselineJobRowBypass(jobId);
    if (!row) return jsonError(404, "job_not_found", "Unknown baseline capture job.", requestId);
    if (row.tenantId !== m.ctx.tenant.id) {
      return jsonError(404, "job_not_found", "Unknown baseline capture job.", requestId);
    }
    return jsonWithRequestId(
      {
        id: row.id,
        status: row.status,
        ...(row.result && typeof row.result === "object" && "captured" in row.result
          ? { captured: (row.result as { captured?: unknown }).captured }
          : {}),
        ...(row.result && typeof row.result === "object" && "failed" in row.result
          ? { failed: (row.result as { failed?: unknown }).failed }
          : {}),
        ...(row.errorDetail ? { error_detail: row.errorDetail } : {}),
        created_at: row.createdAt.toISOString(),
        started_at: row.startedAt?.toISOString() ?? null,
        finished_at: row.finishedAt?.toISOString() ?? null,
      },
      requestId,
    );
  }

  const guard = await requireRole(["operator", "admin"]);
  if (!guard.ok) return guard.response;

  const row = await getBaselineJobRowBypass(jobId);
  if (!row) return jsonError(404, "job_not_found", "Unknown baseline capture job.", requestId);
  if (row.tenantId !== null) {
    return jsonError(404, "job_not_found", "Unknown baseline capture job.", requestId);
  }

  return jsonWithRequestId(
    {
      id: row.id,
      status: row.status,
      ...(row.result && typeof row.result === "object" && "captured" in row.result
        ? { captured: (row.result as { captured?: unknown }).captured }
        : {}),
      ...(row.result && typeof row.result === "object" && "failed" in row.result
        ? { failed: (row.result as { failed?: unknown }).failed }
        : {}),
      ...(row.errorDetail ? { error_detail: row.errorDetail } : {}),
      created_at: row.createdAt.toISOString(),
      started_at: row.startedAt?.toISOString() ?? null,
      finished_at: row.finishedAt?.toISOString() ?? null,
    },
    requestId,
  );
}
