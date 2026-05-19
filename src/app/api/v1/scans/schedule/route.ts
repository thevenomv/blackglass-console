/**
 * GET  /api/v1/scans/schedule  — read the current auto-scan schedule
 * PUT  /api/v1/scans/schedule  — update the auto-scan schedule
 *
 * Plan gate: scheduledScans must be enabled for the tenant's plan.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import {
  getAutoScanSchedule,
  setAutoScanSchedule,
  LEGACY_SCHEDULE_TENANT,
} from "@/lib/server/queue/schedule";
import { planGuard } from "@/lib/plan";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";

const ScheduleBodySchema = z.object({
  enabled: z.boolean(),
  intervalHours: z.number().int().min(1).max(168),
  /** Optional list of collector host_ids — empty / omitted = fleet-wide. */
  hostIds: z.array(z.string().min(1).max(64)).max(200).optional(),
});

function tenantKeyForAccess(
  access: { mode: "saas"; ctx: { tenant: { id: string } } } | { mode: "legacy" },
): string {
  return access.mode === "saas" ? access.ctx.tenant.id : LEGACY_SCHEDULE_TENANT;
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  // BILL-04: skip global guard in SaaS mode (per-tenant plan via subscription row).
  if (!isClerkAuthEnabled()) {
    const guard = planGuard("scheduledScans");
    if (!guard.ok) return guard.response;
  }

  const access = await requireSaasOrLegacyPermission(
    "scans.run",
    ["operator", "admin"],
    { request, scope: "scans.run" },
  );
  if (!access.ok) return access.response;

  const schedule = await getAutoScanSchedule(tenantKeyForAccess(access));
  return NextResponse.json({ schedule, requestId });
}

// ── PUT ──────────────────────────────────────────────────────────────────────
export async function PUT(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkScanPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  // BILL-04: skip global guard in SaaS mode (per-tenant plan via subscription row).
  if (!isClerkAuthEnabled()) {
    const guard = planGuard("scheduledScans");
    if (!guard.ok) return guard.response;
  }

  const access = await requireSaasOrLegacyPermission(
    "scans.run",
    ["operator", "admin"],
    { request, scope: "scans.run" },
  );
  if (!access.ok) return access.response;

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = ScheduleBodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  try {
    await setAutoScanSchedule(tenantKeyForAccess(access), parsed.data);
  } catch (err) {
    // Log full error server-side so operators can see the BullMQ /
    // Redis stack, but return a stable, generic detail to the client
    // — exception strings often contain connection URIs, tenant ids,
    // or other internal context we don't want leaking into the UI.
    console.error(
      "[scans/schedule] setAutoScanSchedule failed:",
      err instanceof Error ? err.stack ?? err.message : err,
    );
    return jsonError(
      500,
      "schedule_update_failed",
      "Could not update the scan schedule. Check console logs.",
      requestId,
    );
  }

  return NextResponse.json({ ok: true, schedule: parsed.data, requestId });
}
