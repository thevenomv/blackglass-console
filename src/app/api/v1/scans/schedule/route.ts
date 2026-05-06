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
import { getAutoScanSchedule, setAutoScanSchedule } from "@/lib/server/queue/schedule";
import { planGuard } from "@/lib/plan";

const ScheduleBodySchema = z.object({
  enabled: z.boolean(),
  intervalHours: z.number().int().min(1).max(168),
});

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const guard = planGuard("scheduledScans");
  if (!guard.ok) return guard.response;

  const access = await requireSaasOrLegacyPermission("scans.run", ["operator", "admin"]);
  if (!access.ok) return access.response;

  const schedule = await getAutoScanSchedule();
  return NextResponse.json({ schedule, requestId });
}

// ── PUT ──────────────────────────────────────────────────────────────────────
export async function PUT(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkScanPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const guard = planGuard("scheduledScans");
  if (!guard.ok) return guard.response;

  const access = await requireSaasOrLegacyPermission("scans.run", ["operator", "admin"]);
  if (!access.ok) return access.response;

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = ScheduleBodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  try {
    await setAutoScanSchedule(parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonError(500, "schedule_update_failed", msg, requestId);
  }

  return NextResponse.json({ ok: true, schedule: parsed.data, requestId });
}
