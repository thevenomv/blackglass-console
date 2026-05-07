/**
 * DELETE /api/v1/drift/mutes/[id]
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import { deleteMute } from "@/lib/server/services/drift-mute-service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  const { id } = await params;

  if (!id || !/^[\w-]{36}$/.test(id)) {
    return jsonError(400, "invalid_id", "Invalid mute id.", requestId);
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
    return jsonError(400, "not_supported", "Drift mutes require SaaS mode.", requestId);
  }

  const ok = await deleteMute(access.ctx.tenant.id, id);
  if (!ok) return jsonError(404, "not_found", "Mute not found.", requestId);
  return NextResponse.json({ ok: true });
}
