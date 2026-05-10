/**
 * POST /api/v1/janitor/cleanup/approve — approve or reject a pending cleanup request (stub execute on approve).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  jsonError,
  readJsonBodyOptional,
  zodErrorResponse,
} from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkBaselinesRate, clientIp } from "@/lib/server/rate-limit";
import {
  approveOrRejectJanitorCleanup,
  JanitorCleanupExecutionError,
} from "@/lib/server/services/janitor-cleanup-service";
import { isCharonAddonEnabled, resolveCharonEntitlements } from "@/lib/saas/plans";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { withTenantRls } from "@/db";
import { janitorCleanupRequests } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const BodySchema = z
  .object({
    requestId: z.string().uuid(),
    action: z.enum(["approve", "reject"]),
  })
  .strict();

export async function POST(request: Request) {
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

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;
  const parsed = BodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const tenantId = access.ctx.tenant.id;
  const ent = resolveCharonEntitlements(access.ctx.subscription.planCode, {
    charonAddon: isCharonAddonEnabled(access.ctx.subscription.features),
  });

  const [reqRow] = await withTenantRls(tenantId, (db) =>
    db
      .select({ id: janitorCleanupRequests.id, mode: janitorCleanupRequests.mode })
      .from(janitorCleanupRequests)
      .where(
        and(
          eq(janitorCleanupRequests.id, parsed.data.requestId),
          eq(janitorCleanupRequests.tenantId, tenantId),
        ),
      )
      .limit(1),
  );
  if (!reqRow) {
    return jsonError(404, "not_found", "Cleanup request not found.", requestId);
  }

  if (parsed.data.action === "approve" && reqRow.mode === "live" && !ent.liveCleanup) {
    return jsonError(
      403,
      "charon_plan_blocked",
      "Live cleanup is not available on your plan.",
      requestId,
    );
  }

  try {
    await approveOrRejectJanitorCleanup(
      tenantId,
      parsed.data.requestId,
      parsed.data.action,
      access.ctx.userId,
      { liveCleanupAllowed: ent.liveCleanup },
    );
  } catch (e) {
    if (e instanceof JanitorCleanupExecutionError) {
      return jsonError(502, "cleanup_execution_failed", e.redactedDetail, requestId);
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "invalid_cleanup_request") {
      return jsonError(400, "invalid_state", "Request is not pending.", requestId);
    }
    if (msg === "live_cleanup_forbidden") {
      return jsonError(403, "charon_plan_blocked", "Live cleanup is not permitted.", requestId);
    }
    if (msg === "finding_not_found" || msg === "account_not_found") {
      return jsonError(404, "not_found", "Related finding or account is missing.", requestId);
    }
    if (msg === "live_cleanup_provider_unsupported") {
      return jsonError(
        400,
        "unsupported_provider",
        "Live cleanup is not available for this provider.",
        requestId,
      );
    }
    if (
      msg === "volume_region_required" ||
      msg === "invalid_droplet_id" ||
      msg === "cleanup_resource_type_unsupported"
    ) {
      return jsonError(400, "cleanup_invalid", msg, requestId);
    }
    if (msg.startsWith("do_") || msg.startsWith("gcp_") || msg.startsWith("aws_")) {
      return jsonError(502, "cloud_api_error", "Cloud provider rejected the delete request.", requestId);
    }
    throw e;
  }

  await emitSaasAudit({
    tenantId,
    actorUserId: access.ctx.userId,
    action:
      parsed.data.action === "approve"
        ? "janitor.cleanup.approved"
        : "janitor.cleanup.rejected",
    targetType: "janitor_cleanup",
    targetId: parsed.data.requestId,
    metadata: { ...(requestId ? { request_id: requestId } : {}) },
  });

  return NextResponse.json({ ok: true }, { headers: { "x-request-id": requestId } });
}
