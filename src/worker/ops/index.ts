/**
 * BLACKGLASS ops worker — single BullMQ consumer process for all
 * background operations the web tier should not block on:
 *
 *   - WEBHOOKS    (outbound webhook delivery + DLQ)
 *   - EXPORTS     (per-tenant data-export bundle assembly + Spaces upload)
 *   - MAINTENANCE (retention sweep + future ops crons)
 *   - JANITOR     (Charon read-only cloud scans)
 *
 * Run alongside scan-worker / sandbox-worker:
 *
 *   node --import tsx/esm src/worker/ops/index.ts
 *   # or via a dedicated DO App Platform worker component
 *
 * Environment variables:
 *   REDIS_QUEUE_URL       — BullMQ Redis connection (required)
 *   DATABASE_URL          — Postgres for retention + exports (required)
 *   SPACES_*              — Spaces creds for exports (optional, falls
 *                           back to inline JSON when unset)
 *   RETENTION_SWEEP_HOURS — retention cadence (default 24h)
 *   OPS_WORKER_CONCURRENCY — per-queue concurrency (default 4)
 *
 * Multi-tenant: every job payload carries its own tenantId; this worker
 * is stateless across jobs.
 */

import { Worker } from "bullmq";
import Redis from "ioredis";
import { QUEUE_NAMES, redisConnectionFromUrl } from "@/lib/server/queue/config";
import { deliverWebhookInline } from "@/lib/server/outbound-webhook";
import type { WebhookJobPayload } from "@/lib/server/queue/webhook-queue";
import type { ExportJobPayload } from "@/lib/server/queue/export-queue";
import type { MaintenanceJobPayload } from "@/lib/server/queue/maintenance-queue";
import type { JanitorScanJobPayload } from "@/lib/server/queue/janitor-queue";
import {
  installRetentionRepeatable,
  installDriftDigestRepeatable,
  installPartitionMaintenanceRepeatable,
  installCharonScheduleRepeatable,
} from "@/lib/server/queue/maintenance-queue";
import { runExportJob } from "@/lib/server/services/export-service";
import { pruneAllTenants } from "@/lib/server/services/retention-service";
import { runDriftDigest } from "@/lib/server/services/drift-digest-service";
import { ensureUpcomingDriftPartitions } from "@/lib/server/services/partition-maintenance-service";
import { expireStaleBaselineCaptureJobs } from "@/lib/server/services/baseline-capture-async";
import { executeJanitorScanJob } from "@/lib/server/services/janitor-scan-job";
import { runCharonScheduledScanTick } from "@/lib/server/services/charon-scheduled-scan-service";
import { logStructured } from "@/lib/server/log";

const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
if (!redisUrl) {
  console.error("[ops-worker] REDIS_QUEUE_URL is not set — worker cannot start");
  process.exit(1);
}

const concurrency = (() => {
  const v = process.env.OPS_WORKER_CONCURRENCY?.trim();
  if (v) {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 4;
})();

const opsRedisConn = redisConnectionFromUrl(redisUrl);

console.info(
  `[ops-worker] Starting — queues=${QUEUE_NAMES.WEBHOOKS},${QUEUE_NAMES.EXPORTS},${QUEUE_NAMES.MAINTENANCE},${QUEUE_NAMES.JANITOR} concurrency=${concurrency}`,
);

// ---------------------------------------------------------------------------
// Webhook delivery worker
// ---------------------------------------------------------------------------

const webhookWorker = new Worker<WebhookJobPayload>(
  QUEUE_NAMES.WEBHOOKS,
  async (job) => {
    const { url, body, headers, tenantId, scanId } = job.data;
    logStructured("info", "webhook_delivery_start", {
      tenantId,
      scanId,
      url: redactUrl(url),
      attempt: job.attemptsMade + 1,
    });
    await deliverWebhookInline(url, body, headers);
  },
  {
    connection: opsRedisConn,
    concurrency,
  },
);

webhookWorker.on("completed", (job) => {
  logStructured("info", "webhook_delivery_completed", {
    bullJobId: job.id,
    scanId: job.data.scanId,
    tenantId: job.data.tenantId,
  });
});

webhookWorker.on("failed", (job, err) => {
  const attempts = job?.opts?.attempts ?? 1;
  const made = job?.attemptsMade ?? 0;
  const isFinal = made >= attempts;
  logStructured(isFinal ? "error" : "warn", "webhook_delivery_failed", {
    bullJobId: job?.id,
    scanId: job?.data?.scanId,
    tenantId: job?.data?.tenantId,
    url: job?.data?.url ? redactUrl(job.data.url) : undefined,
    attempt: made,
    final: isFinal,
    error: err instanceof Error ? err.message : String(err),
  });
});

// ---------------------------------------------------------------------------
// Data-export worker
// ---------------------------------------------------------------------------

const exportWorker = new Worker<ExportJobPayload>(
  QUEUE_NAMES.EXPORTS,
  async (job) => {
    const { exportId, tenantId } = job.data;
    logStructured("info", "data_export_start", {
      bullJobId: job.id,
      exportId,
      tenantId,
      attempt: job.attemptsMade + 1,
    });
    await runExportJob(exportId, tenantId);
  },
  {
    connection: opsRedisConn,
    // Bundle assembly + Spaces upload is I/O bound but each job collects
    // every drift event for the tenant; cap below the webhook concurrency.
    concurrency: Math.max(1, Math.floor(concurrency / 2)),
  },
);

exportWorker.on("completed", (job) =>
  logStructured("info", "data_export_completed", {
    bullJobId: job.id,
    exportId: job.data.exportId,
    tenantId: job.data.tenantId,
  }),
);
exportWorker.on("failed", (job, err) =>
  logStructured("error", "data_export_failed", {
    bullJobId: job?.id,
    exportId: job?.data?.exportId,
    tenantId: job?.data?.tenantId,
    error: err instanceof Error ? err.message : String(err),
  }),
);

// ---------------------------------------------------------------------------
// Maintenance worker (retention sweep)
// ---------------------------------------------------------------------------

const maintenanceWorker = new Worker<MaintenanceJobPayload>(
  QUEUE_NAMES.MAINTENANCE,
  async (job) => {
    switch (job.data.type) {
      case "retention-sweep": {
        const startedAt = Date.now();
        logStructured("info", "retention_sweep_start", { bullJobId: job.id });
        const results = await pruneAllTenants();
        const totals = results.reduce(
          (acc, r) => {
            acc.tenantsProcessed += 1;
            acc.driftEventsDeleted += r.driftEventsDeleted;
            acc.baselineSnapshotsDeleted += r.baselineSnapshotsDeleted;
            acc.auditEventsDeleted += r.auditEventsDeleted;
            acc.evidenceBundlesDeleted += r.evidenceBundlesDeleted;
            acc.tenantsWithErrors += r.errors.length > 0 ? 1 : 0;
            return acc;
          },
          {
            tenantsProcessed: 0,
            driftEventsDeleted: 0,
            baselineSnapshotsDeleted: 0,
            auditEventsDeleted: 0,
            evidenceBundlesDeleted: 0,
            tenantsWithErrors: 0,
          },
        );
        const baselineStale = await expireStaleBaselineCaptureJobs();
        logStructured("info", "retention_sweep_completed", {
          bullJobId: job.id,
          ...totals,
          baselineStaleJobs: baselineStale.markedFailed,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }
      case "partition-maintenance": {
        const startedAt = Date.now();
        const result = await ensureUpcomingDriftPartitions();
        logStructured("info", "partition_maintenance_completed", {
          bullJobId: job.id,
          createdCount: result.created.length,
          existingCount: result.existing.length,
          errorCount: Object.keys(result.errors).length,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }
      case "drift-digest": {
        const startedAt = Date.now();
        logStructured("info", "drift_digest_start", { bullJobId: job.id });
        const results = await runDriftDigest();
        const totals = results.reduce(
          (acc, r) => {
            acc.tenantsConsidered += 1;
            if (r.emailSent) acc.tenantsEmailed += 1;
            if (r.skippedReason === "no_drift_in_window")
              acc.tenantsSkippedNoDrift += 1;
            if (r.error) acc.tenantsWithErrors += 1;
            acc.totalsHigh += r.totalsHigh;
            acc.totalsNew += r.totalsNew;
            return acc;
          },
          {
            tenantsConsidered: 0,
            tenantsEmailed: 0,
            tenantsSkippedNoDrift: 0,
            tenantsWithErrors: 0,
            totalsHigh: 0,
            totalsNew: 0,
          },
        );
        logStructured("info", "drift_digest_completed", {
          bullJobId: job.id,
          ...totals,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }
      case "charon-scheduled-scans": {
        const startedAt = Date.now();
        logStructured("info", "charon_scheduled_scan_tick_start", { bullJobId: job.id });
        const res = await runCharonScheduledScanTick();
        logStructured("info", "charon_scheduled_scan_tick_completed", {
          bullJobId: job.id,
          ...res,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }
      default: {
        const _exhaustive: never = job.data.type;
        throw new Error(`Unknown maintenance job type: ${String(_exhaustive)}`);
      }
    }
  },
  {
    connection: opsRedisConn,
    concurrency: 1, // never want two retention sweeps overlapping
  },
);

maintenanceWorker.on("failed", (job, err) =>
  logStructured("error", "maintenance_job_failed", {
    bullJobId: job?.id,
    type: job?.data?.type,
    error: err instanceof Error ? err.message : String(err),
  }),
);

// ---------------------------------------------------------------------------
// Charon janitor worker
// ---------------------------------------------------------------------------

const janitorWorker = new Worker<JanitorScanJobPayload>(
  QUEUE_NAMES.JANITOR,
  async (job) => {
    const { tenantId, accountId } = job.data;
    logStructured("info", "janitor_scan_start", {
      bullJobId: job.id,
      tenantId,
      accountId,
      attempt: job.attemptsMade + 1,
    });
    await executeJanitorScanJob(job.data);
  },
  {
    connection: opsRedisConn,
    concurrency: Math.max(1, Math.floor(concurrency / 2)),
  },
);

janitorWorker.on("failed", (job, err) =>
  logStructured("error", "janitor_scan_failed", {
    bullJobId: job?.id,
    accountId: job?.data?.accountId,
    tenantId: job?.data?.tenantId,
    error: err instanceof Error ? err.message : String(err),
  }),
);

// ---------------------------------------------------------------------------
// Install repeatable crons on boot — guarded by a Redis distributed lock
// (QUEUE-06) so multiple ops-worker instances starting simultaneously don't
// race and create duplicate repeatables. The lock TTL (60 s) covers the
// worst-case time to register all four repeatables; the winner runs all
// installs and losers skip them (the queue already has the repeatables from
// the winner, so no install is needed).
// ---------------------------------------------------------------------------

const SCHEDULER_LOCK_KEY = "ops:scheduler:lock";
const SCHEDULER_LOCK_TTL_SECS = 60;
const schedulerWorkerId = `ops-worker-${process.pid}-${Date.now()}`;

void (async () => {
  // Use a dedicated short-lived ioredis client for the lock so BullMQ
  // worker connections aren't reused for raw commands.
  const lockClient = new Redis({ ...opsRedisConn, lazyConnect: false });
  try {
    // SET key value NX EX ttl — returns "OK" when acquired, null when not.
    const acquired = await lockClient.set(
      SCHEDULER_LOCK_KEY,
      schedulerWorkerId,
      "EX",
      SCHEDULER_LOCK_TTL_SECS,
      "NX",
    );

    if (acquired !== "OK") {
      logStructured("info", "scheduler_lock_skipped", {
        workerId: schedulerWorkerId,
        reason: "another worker holds the lock",
      });
      return;
    }

    logStructured("info", "scheduler_lock_acquired", { workerId: schedulerWorkerId });

    await installRetentionRepeatable()
      .then((res) => {
        if (res.installed) {
          logStructured("info", "retention_repeatable_installed", { everyMs: res.everyMs });
        }
      })
      .catch((err) =>
        logStructured("error", "retention_repeatable_install_failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );

    await installPartitionMaintenanceRepeatable()
      .then((res) => {
        if (res.installed) {
          logStructured("info", "partition_maintenance_repeatable_installed", {
            everyMs: res.everyMs,
          });
        }
      })
      .catch((err) =>
        logStructured("error", "partition_maintenance_repeatable_install_failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );

    await installDriftDigestRepeatable()
      .then((res) => {
        logStructured("info", "drift_digest_repeatable", {
          installed: res.installed,
          everyMs: res.everyMs,
          interval: res.interval,
        });
      })
      .catch((err) =>
        logStructured("error", "drift_digest_repeatable_install_failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );

    await installCharonScheduleRepeatable()
      .then((res) => {
        if (res.installed) {
          logStructured("info", "charon_schedule_repeatable_installed", { everyMs: res.everyMs });
        }
      })
      .catch((err) =>
        logStructured("error", "charon_schedule_repeatable_install_failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
  } catch (err) {
    logStructured("error", "scheduler_lock_error", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await lockClient.quit().catch(() => {});
  }
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip any querystring from URLs we log, since some webhook receivers
 * embed credentials in the URL (Slack hooks, generic webhook tokens). */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string) {
  console.info(`[ops-worker] ${signal}: closing workers (forced exit in 25 s if needed)...`);
  const forceExit = setTimeout(() => {
    console.warn("[ops-worker] Forced exit — workers did not drain in time");
    process.exit(1);
  }, 25_000);
  forceExit.unref();
  await Promise.allSettled([
    webhookWorker.close(),
    exportWorker.close(),
    maintenanceWorker.close(),
    janitorWorker.close(),
  ]);
  clearTimeout(forceExit);
  console.info("[ops-worker] All workers closed — exiting");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
