/**
 * DELETE /api/v1/evidence/cis-mappings/[id]
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { deleteCisMapping } from "@/lib/server/services/cis-service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  const { id } = await params;
  if (!id || !/^[\w-]{36}$/.test(id)) {
    return jsonError(400, "invalid_id", "Invalid mapping id.", requestId);
  }
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(400, "not_supported", "CIS mappings require SaaS mode.", requestId);
  }

  const ok = await deleteCisMapping(access.ctx.tenant.id, id);
  if (!ok) return jsonError(404, "not_found", "Mapping not found.", requestId);
  return NextResponse.json({ ok: true });
}
