/**
 * BullMQ-backed maintenance queue + repeatable installer.
 *
 * Producer side. The single repeatable job kicks the retention sweep on a
 * fixed schedule so we don't need an external cron (DO Functions, GH
 * Actions, etc.) to keep retention working — the operator only has to run
 * the ops-worker process.
 *
 * The interval is configured via `RETENTION_SWEEP_HOURS` (default 24h).
 *
 * `installRetentionRepeatable()` is idempotent: it re-applies the current
 * interval on every worker boot and removes any older repeatable that no
 * longer matches the configured cadence.
 */

import { QUEUE_NAMES, RETRY_POLICIES, RETENTION } from "./config";
import { digestEveryMs, digestInterval } from "@/lib/server/services/drift-digest-service";

export type MaintenanceJobType = "retention-sweep" | "drift-digest";

export interface MaintenanceJobPayload {
  type: MaintenanceJobType;
}

const QUEUE_KEY = "__blackglass_maintenance_queue_v1" as const;
type G = typeof globalThis & {
  [QUEUE_KEY]?: import("bullmq").Queue<MaintenanceJobPayload>;
};

const REPEATABLE_JOB_NAME = "maintenance:retention-sweep";
const REPEATABLE_JOB_ID = "retention-sweep";

const DIGEST_REPEATABLE_JOB_NAME = "maintenance:drift-digest";
const DIGEST_REPEATABLE_JOB_ID = "drift-digest";

function retentionEveryMs(): number {
  const raw = process.env.RETENTION_SWEEP_HOURS?.trim();
  if (!raw) return 24 * 60 * 60 * 1000;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 24 * 60 * 60 * 1000;
  return n * 60 * 60 * 1000;
}

export async function getMaintenanceQueue(): Promise<import("bullmq").Queue<MaintenanceJobPayload> | null> {
  const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
  if (!redisUrl) return null;

  const g = globalThis as G;
  if (!g[QUEUE_KEY]) {
    const { Queue } = await import("bullmq");
    g[QUEUE_KEY] = new Queue<MaintenanceJobPayload>(QUEUE_NAMES.MAINTENANCE, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        ...RETRY_POLICIES.maintenance,
        ...RETENTION.maintenance,
      },
    });
  }
  return g[QUEUE_KEY]!;
}

/**
 * Ensure exactly one retention-sweep repeatable is registered with the
 * currently-configured cadence. Safe to call on every worker boot.
 */
export async function installRetentionRepeatable(): Promise<{
  installed: boolean;
  everyMs: number;
}> {
  const queue = await getMaintenanceQueue();
  if (!queue) return { installed: false, everyMs: 0 };

  const everyMs = retentionEveryMs();
  const existing = await queue.getRepeatableJobs();
  await Promise.all(
    existing
      .filter((j) => j.name === REPEATABLE_JOB_NAME)
      .map((j) => queue.removeRepeatableByKey(j.key)),
  );

  await queue.add(
    REPEATABLE_JOB_NAME,
    { type: "retention-sweep" },
    {
      repeat: { every: everyMs },
      jobId: REPEATABLE_JOB_ID,
    },
  );

  return { installed: true, everyMs };
}

/**
 * Ensure exactly one drift-digest repeatable is registered with the
 * cadence implied by `DRIFT_DIGEST_INTERVAL`. Safe to call on every
 * worker boot. Returns `installed: false` when the cadence is "off"
 * or when Redis is not configured — in both cases any prior repeatable
 * is removed so the queue cannot drift out of sync with the env.
 */
export async function installDriftDigestRepeatable(): Promise<{
  installed: boolean;
  everyMs: number;
  interval: ReturnType<typeof digestInterval>;
}> {
  const interval = digestInterval();
  const queue = await getMaintenanceQueue();
  if (!queue) return { installed: false, everyMs: 0, interval };

  const existing = await queue.getRepeatableJobs();
  await Promise.all(
    existing
      .filter((j) => j.name === DIGEST_REPEATABLE_JOB_NAME)
      .map((j) => queue.removeRepeatableByKey(j.key)),
  );

  if (interval === "off") {
    return { installed: false, everyMs: 0, interval };
  }

  const everyMs = digestEveryMs(interval);
  await queue.add(
    DIGEST_REPEATABLE_JOB_NAME,
    { type: "drift-digest" },
    {
      repeat: { every: everyMs },
      jobId: DIGEST_REPEATABLE_JOB_ID,
    },
  );
  return { installed: true, everyMs, interval };
}
