/**
 * GET  /api/v1/janitor/suppressions — list dismiss/snooze rules
 * DELETE /api/v1/janitor/suppressions — remove a suppression by id (resource may reappear on scan)
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  jsonError,
  zodErrorResponse,
} from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkBaselinesRate, checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import {
  deleteJanitorSuppression,
  listJanitorSuppressions,
} from "@/lib/server/services/janitor-suppression-service";
import { z } from "zod";
import { emitSaasAudit } from "@/lib/saas/event-log";

const DeleteQuerySchema = z.object({
  id: z.string().uuid(),
});

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("janitor.read", ["operator", "admin"], {
    request,
  });
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return NextResponse.json({ suppressions: [] }, { headers: { "x-request-id": requestId } });
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId")?.trim();
  const aid =
    accountId && /^[0-9a-f-]{36}$/i.test(accountId) ? accountId : undefined;

  const rows = await listJanitorSuppressions(access.ctx.tenant.id, aid);

  return NextResponse.json({ suppressions: rows }, { headers: { "x-request-id": requestId } });
}

export async function DELETE(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkBaselinesRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("janitor.manage", ["operator", "admin"], {
    request,
  });
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(403, "saas_only", "Charon requires a hosted workspace.", requestId);
  }

  const url = new URL(request.url);
  const parsed = DeleteQuerySchema.safeParse({ id: url.searchParams.get("id") ?? "" });
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const ok = await deleteJanitorSuppression(access.ctx.tenant.id, parsed.data.id);
  if (!ok) {
    return jsonError(404, "not_found", "Suppression not found.", requestId);
  }

  await emitSaasAudit({
    tenantId: access.ctx.tenant.id,
    actorUserId: access.ctx.userId,
    action: "janitor.suppression.removed",
    targetType: "janitor_suppression",
    targetId: parsed.data.id,
    metadata: { ...(requestId ? { request_id: requestId } : {}) },
  });

  return NextResponse.json({ ok: true }, { headers: { "x-request-id": requestId } });
}
