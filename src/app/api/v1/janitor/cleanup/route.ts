/**
 * POST /api/v1/janitor/cleanup — enqueue cleanup requests for findings (HITL; stub executor).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { withTenantRls } from "@/db";
import { janitorAccounts, janitorFindings } from "@/db/schema";
import {
  jsonError,
  readJsonBodyOptional,
  zodErrorResponse,
} from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkBaselinesRate, clientIp } from "@/lib/server/rate-limit";
import { createJanitorCleanupRequests } from "@/lib/server/services/janitor-cleanup-service";
import { notifyCharonCleanupQueuedSlack } from "@/lib/server/services/charon-cleanup-slack-notify";
import { isCharonAddonEnabled, resolveCharonEntitlements } from "@/lib/saas/plans";
import { emitSaasAudit } from "@/lib/saas/event-log";

const BodySchema = z
  .object({
    findingIds: z.array(z.string().uuid()).min(1).max(50),
    mode: z.enum(["dry_run", "live"]),
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

  const planCode = access.ctx.subscription.planCode;
  const ent = resolveCharonEntitlements(planCode, {
    charonAddon: isCharonAddonEnabled(access.ctx.subscription.features),
  });
  if (!ent.cleanupQueue) {
    return jsonError(
      403,
      "charon_plan_blocked",
      "Cleanup requests are not included on the Lab plan. Upgrade to use the cleanup queue.",
      requestId,
    );
  }
  if (parsed.data.mode === "live" && !ent.liveCleanup) {
    return jsonError(
      403,
      "charon_plan_blocked",
      "Live cleanup is available on Growth and higher. Use dry-run on your current plan.",
      requestId,
    );
  }

  const tenantId = access.ctx.tenant.id;

  if (parsed.data.mode === "live") {
    const liveRows = await withTenantRls(tenantId, (db) =>
      db
        .select({
          provider: janitorAccounts.provider,
          resourceType: janitorFindings.resourceType,
        })
        .from(janitorFindings)
        .innerJoin(janitorAccounts, eq(janitorFindings.accountId, janitorAccounts.id))
        .where(
          and(
            eq(janitorFindings.tenantId, tenantId),
            inArray(janitorFindings.id, parsed.data.findingIds),
          ),
        ),
    );
    const liveByProvider: Record<string, Set<string>> = {
      do: new Set(["droplet", "volume", "snapshot"]),
      aws: new Set(["ec2_instance", "ebs_volume", "ebs_snapshot"]),
      gcp: new Set(["gce_disk", "gce_snapshot"]),
    };
    for (const r of liveRows) {
      const allowed = liveByProvider[r.provider];
      if (!allowed?.has(r.resourceType)) {
        return jsonError(
          400,
          "live_cleanup_scope",
          "Live cleanup supports DigitalOcean droplets/volumes/snapshots, AWS EC2/EBS resources, and GCP disks/snapshots. Use dry-run for anything else.",
          requestId,
        );
      }
    }
  }

  let ids: string[];
  try {
    ids = await createJanitorCleanupRequests(tenantId, parsed.data.findingIds, parsed.data.mode);
  } catch {
    return jsonError(500, "internal_error", "Could not create cleanup requests.", requestId);
  }

  await emitSaasAudit({
    tenantId,
    actorUserId: access.ctx.userId,
    action: "janitor.cleanup.requested",
    targetType: "janitor_cleanup",
    targetId: ids[0] ?? "batch",
    metadata: {
      ...(requestId ? { request_id: requestId } : {}),
      count: ids.length,
      mode: parsed.data.mode,
    },
  });

  void notifyCharonCleanupQueuedSlack(tenantId, {
    count: ids.length,
    mode: parsed.data.mode,
  });

  return NextResponse.json(
    { requestIds: ids, status: "pending" },
    { status: 202, headers: { "x-request-id": requestId } },
  );
}
