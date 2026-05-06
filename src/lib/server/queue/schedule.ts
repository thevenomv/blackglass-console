/**
 * Auto-scan scheduler — BullMQ repeatable job management.
 *
 * Stores the schedule configuration in Redis and adds/removes a repeatable
 * BullMQ job on the SCANS queue.  No-ops when REDIS_QUEUE_URL is unset.
 *
 * Plan gate: scheduledScans must be true in plan limits.
 *
 * Usage:
 *   import { getAutoScanSchedule, setAutoScanSchedule } from "@/lib/server/queue/schedule";
 *   const config = await getAutoScanSchedule();
 *   await setAutoScanSchedule({ enabled: true, intervalHours: 4 });
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
}

const DEFAULT_SCHEDULE: AutoScanSchedule = { enabled: false, intervalHours: 4 };
const REPEATABLE_JOB_NAME = "auto-fleet-scan";
const SCHEDULE_KEY = "bg:auto-scan-schedule";

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

/** Read the current auto-scan schedule from Redis.  Falls back to disabled. */
export async function getAutoScanSchedule(): Promise<AutoScanSchedule> {
  const client = await redisClient();
  if (!client) return DEFAULT_SCHEDULE;
  try {
    const raw = await client.get(SCHEDULE_KEY);
    client.disconnect();
    if (!raw) return DEFAULT_SCHEDULE;
    const parsed = JSON.parse(raw) as Partial<AutoScanSchedule>;
    return {
      enabled: parsed.enabled ?? false,
      intervalHours: Number.isFinite(parsed.intervalHours) ? (parsed.intervalHours as number) : 4,
    };
  } catch {
    client.disconnect();
    return DEFAULT_SCHEDULE;
  }
}

/**
 * Persist a new auto-scan schedule and update the BullMQ repeatable job.
 * - Removes any existing `auto-fleet-scan` repeatable job first.
 * - Adds a new one if `enabled` is true.
 */
export async function setAutoScanSchedule(schedule: AutoScanSchedule): Promise<void> {
  const url = process.env.REDIS_QUEUE_URL?.trim();
  if (!url) return; // in-process mode — scheduled scans not supported

  const { Queue } = await import("bullmq");
  const queue = new Queue<ScanJobPayload>(QUEUE_NAMES.SCANS, {
    connection: { url },
    defaultJobOptions: { ...RETRY_POLICIES.scan, ...RETENTION.scans },
  });

  // Remove existing repeatable jobs for auto-scan
  const existingJobs = await queue.getRepeatableJobs();
  await Promise.all(
    existingJobs
      .filter((j) => j.name === REPEATABLE_JOB_NAME)
      .map((j) => queue.removeRepeatableByKey(j.key)),
  );

  // Add new job if enabled
  if (schedule.enabled && schedule.intervalHours >= 1) {
    const everyMs = schedule.intervalHours * 60 * 60 * 1000;
    const autoJobId = `auto-scan-repeatable-v1`;
    const payload: ScanJobPayload = {
      jobId: autoJobId,
      collectOpts: { scanId: autoJobId, reason: "drift_scan" as const },
    };
    await queue.add(REPEATABLE_JOB_NAME, payload, {
      repeat: { every: everyMs },
      jobId: autoJobId,
    });
  }

  await queue.close();

  // Persist config in Redis so GET can read it without inspecting BullMQ
  const client = await redisClient();
  if (client) {
    await client.set(SCHEDULE_KEY, JSON.stringify(schedule));
    client.disconnect();
  }
}
