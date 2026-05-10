/**
 * Enqueue Charon scans for linked accounts on daily/weekly schedules.
 * Invoked from ops-worker maintenance queue (trusted bypass RLS).
 */

import { and, eq, inArray } from "drizzle-orm";
import { withBypassRls, tryGetDb } from "@/db";
import { janitorAccounts, saasSubscriptions } from "@/db/schema";
import { enqueueJanitorScanJob } from "@/lib/server/queue/janitor-queue";
import { logStructured } from "@/lib/server/log";
import { isCharonAddonEnabled, resolveCharonEntitlements } from "@/lib/saas/plans";

const MS_HOUR = 3600_000;
const MS_DAY = 86_400_000;

function dueForSchedule(
  schedule: string,
  lastScanAt: Date | null,
  nowMs: number,
): boolean {
  const last = lastScanAt ? lastScanAt.getTime() : 0;
  if (schedule === "daily") {
    return nowMs - last >= 20 * MS_HOUR;
  }
  if (schedule === "weekly") {
    return nowMs - last >= 6 * MS_DAY;
  }
  return false;
}

export async function runCharonScheduledScanTick(): Promise<{
  candidates: number;
  enqueued: number;
  skippedNotDue: number;
  skippedPlan: number;
}> {
  const db = tryGetDb();
  if (!db) {
    return { candidates: 0, enqueued: 0, skippedNotDue: 0, skippedPlan: 0 };
  }

  // RLS-BYPASS: ops-worker maintenance tick fans out across all tenants;
  // each enqueued scan job carries its own tenantId for downstream RLS.
  return withBypassRls(async (tx) => {
    const rows = await tx
      .select({
        accountId: janitorAccounts.id,
        tenantId: janitorAccounts.tenantId,
        scanSchedule: janitorAccounts.scanSchedule,
        lastScanAt: janitorAccounts.lastScanAt,
        planCode: saasSubscriptions.planCode,
        features: saasSubscriptions.features,
        subStatus: saasSubscriptions.status,
      })
      .from(janitorAccounts)
      .innerJoin(saasSubscriptions, eq(janitorAccounts.tenantId, saasSubscriptions.tenantId))
      .where(
        and(
          inArray(janitorAccounts.scanSchedule, ["daily", "weekly"]),
          inArray(saasSubscriptions.status, ["active", "trialing", "custom"]),
        ),
      );

    const nowMs = Date.now();
    let enqueued = 0;
    let skippedNotDue = 0;
    let skippedPlan = 0;

    for (const row of rows) {
      if (!dueForSchedule(row.scanSchedule, row.lastScanAt, nowMs)) {
        skippedNotDue++;
        continue;
      }

      const ent = resolveCharonEntitlements(row.planCode, {
        charonAddon: isCharonAddonEnabled(row.features),
      });
      if (!ent.scheduledScansAllowed) {
        skippedPlan++;
        continue;
      }

      const queued = await enqueueJanitorScanJob({
        tenantId: row.tenantId,
        accountId: row.accountId,
        requestId: `charon-schedule:${row.accountId}:${nowMs}`,
        actorUserId: null,
      });

      if (queued) {
        enqueued++;
        logStructured("info", "charon_scheduled_scan_enqueued", {
          tenantId: row.tenantId,
          accountId: row.accountId,
          schedule: row.scanSchedule,
        });
      } else {
        logStructured("warn", "charon_scheduled_scan_no_queue", {
          tenantId: row.tenantId,
          accountId: row.accountId,
          detail: "REDIS_QUEUE_URL unset — scheduled Charon scans require ops-worker with Redis",
        });
      }
    }

    return {
      candidates: rows.length,
      enqueued,
      skippedNotDue,
      skippedPlan,
    };
  });
}

export function charonScheduleTickEveryMs(): number {
  const raw = process.env.CHARON_SCHEDULE_TICK_MINUTES?.trim();
  const n = raw ? parseInt(raw, 10) : 60;
  const minutes = Number.isFinite(n) && n >= 5 ? n : 60;
  return minutes * 60 * 1000;
}
