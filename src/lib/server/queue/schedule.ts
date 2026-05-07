/**
 * Auto-scan scheduler — BullMQ repeatable job management.
 *
 * Stores the schedule configuration in Redis and adds/removes a repeatable
 * BullMQ job on the SCANS queue.  No-ops when REDIS_QUEUE_URL is unset.
 *
 * Plan gate: scheduledScans must be true in plan limits.
 *
 * Tenant scoping
 * --------------
 * Every Redis key and BullMQ jobId is namespaced by tenant id so two tenants
 * enabling auto-scan do not overwrite each other's schedule.  In legacy
 * (non-SaaS) mode the literal key `"legacy"` is used.
 *
 * Usage:
 *   await getAutoScanSchedule(tenantId);
 *   await setAutoScanSchedule(tenantId, { enabled: true, intervalHours: 4 });
 */

import { QUEUE_NAMES, RETRY_POLICIES, RETENTION } from "./config";
import type { ScanJobPayload } from "./scan-queue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoScanSchedule {
  enabled: boolean;
  /** How often to trigger an automatic fleet scan. Min: 1h, max: 168h (1 week). */
  intervalHours: number;
  /**
   * Optional collector host id allow-list.  Empty/undefined = fleet-wide
   * scan.  When set, only the listed host_ids are included in each
   * scheduled scan (CollectScanOptions.hostIds).
   */
  hostIds?: string[];
}

const DEFAULT_SCHEDULE: AutoScanSchedule = { enabled: false, intervalHours: 4 };

/** Tenant id used by the legacy (non-SaaS) deployment. */
export const LEGACY_SCHEDULE_TENANT = "legacy";

function scheduleKey(tenantId: string): string {
  return `bg:auto-scan-schedule:${tenantId}`;
}

function repeatableJobName(tenantId: string): string {
  return `auto-fleet-scan:${tenantId}`;
}

function repeatableJobId(tenantId: string): string {
  return `auto-scan-${tenantId}`;
}

// ---------------------------------------------------------------------------
// Redis helpers
// ---------------------------------------------------------------------------

async function redisClient() {
  const url = process.env.REDIS_QUEUE_URL?.trim();
  if (!url) return null;
  const { default: Redis } = await import("ioredis");
  const tls = url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
  return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, ...tls });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the current auto-scan schedule for a tenant.  Falls back to disabled. */
export async function getAutoScanSchedule(tenantId: string): Promise<AutoScanSchedule> {
  const client = await redisClient();
  if (!client) return DEFAULT_SCHEDULE;
  try {
    const raw = await client.get(scheduleKey(tenantId));
    client.disconnect();
    if (!raw) return DEFAULT_SCHEDULE;
    const parsed = JSON.parse(raw) as Partial<AutoScanSchedule>;
    const hostIds = Array.isArray(parsed.hostIds)
      ? parsed.hostIds.filter((h): h is string => typeof h === "string")
      : undefined;
    return {
      enabled: parsed.enabled ?? false,
      intervalHours: Number.isFinite(parsed.intervalHours) ? (parsed.intervalHours as number) : 4,
      ...(hostIds && hostIds.length > 0 ? { hostIds } : {}),
    };
  } catch {
    client.disconnect();
    return DEFAULT_SCHEDULE;
  }
}

/**
 * Persist a new auto-scan schedule and update the BullMQ repeatable job.
 * - Removes any existing per-tenant `auto-fleet-scan:{tenantId}` repeatable job first.
 * - Adds a new one if `enabled` is true.
 */
export async function setAutoScanSchedule(
  tenantId: string,
  schedule: AutoScanSchedule,
): Promise<void> {
  const url = process.env.REDIS_QUEUE_URL?.trim();
  if (!url) return; // in-process mode — scheduled scans not supported

  const { Queue } = await import("bullmq");
  const queue = new Queue<ScanJobPayload>(QUEUE_NAMES.SCANS, {
    connection: { url },
    defaultJobOptions: { ...RETRY_POLICIES.scan, ...RETENTION.scans },
  });

  const jobName = repeatableJobName(tenantId);
  const existingJobs = await queue.getRepeatableJobs();
  await Promise.all(
    existingJobs
      .filter((j) => j.name === jobName)
      .map((j) => queue.removeRepeatableByKey(j.key)),
  );

  if (schedule.enabled && schedule.intervalHours >= 1) {
    const everyMs = schedule.intervalHours * 60 * 60 * 1000;
    const autoJobId = repeatableJobId(tenantId);
    const hostIds = schedule.hostIds && schedule.hostIds.length > 0 ? schedule.hostIds : undefined;
    const payload: ScanJobPayload = {
      jobId: autoJobId,
      collectOpts: {
        scanId: autoJobId,
        reason: "drift_scan" as const,
        ...(hostIds ? { hostIds } : {}),
        ...(tenantId !== LEGACY_SCHEDULE_TENANT ? { tenantId } : {}),
      },
      ...(tenantId !== LEGACY_SCHEDULE_TENANT ? { saasTenantId: tenantId } : {}),
    };
    await queue.add(jobName, payload, {
      repeat: { every: everyMs },
      jobId: autoJobId,
    });
  }

  await queue.close();

  const client = await redisClient();
  if (client) {
    await client.set(scheduleKey(tenantId), JSON.stringify(schedule));
    client.disconnect();
  }
}
