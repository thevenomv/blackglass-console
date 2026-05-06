/**
 * DELETE /api/v1/policies/[id]  — delete a specific policy rule
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import { deletePolicy } from "@/lib/server/services/policy-service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  const { id } = await params;

  if (!id || !/^[\w-]{36}$/.test(id)) {
    return jsonError(400, "invalid_id", "Invalid policy ID.", requestId);
  }

  if (!(await checkScanPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("reports.view", ["operator", "admin"]);
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return jsonError(400, "not_supported", "Policies require SaaS mode.", requestId);
  }

  const deleted = await deletePolicy(access.ctx.tenant.id, id);
  if (!deleted) {
    return jsonError(404, "not_found", "Policy not found.", requestId);
  }

  return NextResponse.json({ ok: true });
}
