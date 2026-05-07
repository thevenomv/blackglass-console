/**
 * BLACKGLASS ops worker — single BullMQ consumer process for all
 * background operations the web tier should not block on:
 *
 *   - WEBHOOKS    (outbound webhook delivery + DLQ)
 *   - EXPORTS     (per-tenant data-export bundle assembly + Spaces upload)
 *   - MAINTENANCE (retention sweep + future ops crons)
 *
 * Run alongside scan-worker / sandbox-worker:
 *
 *   node --import tsx/esm src/worker/ops-worker.ts
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
import { QUEUE_NAMES } from "@/lib/server/queue/config";
import { deliverWebhookInline } from "@/lib/server/outbound-webhook";
import type { WebhookJobPayload } from "@/lib/server/queue/webhook-queue";
import type { ExportJobPayload } from "@/lib/server/queue/export-queue";
import type { MaintenanceJobPayload } from "@/lib/server/queue/maintenance-queue";
import { installRetentionRepeatable } from "@/lib/server/queue/maintenance-queue";
import { runExportJob } from "@/lib/server/services/export-service";
import { pruneAllTenants } from "@/lib/server/services/retention-service";
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

console.info(
  `[ops-worker] Starting — queues=${QUEUE_NAMES.WEBHOOKS},${QUEUE_NAMES.EXPORTS},${QUEUE_NAMES.MAINTENANCE} concurrency=${concurrency}`,
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
    connection: { url: redisUrl },
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
    connection: { url: redisUrl },
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
        logStructured("info", "retention_sweep_completed", {
          bullJobId: job.id,
          ...totals,
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
    connection: { url: redisUrl },
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
// Install retention repeatable on boot (idempotent)
// ---------------------------------------------------------------------------

void installRetentionRepeatable()
  .then((res) => {
    if (res.installed) {
      logStructured("info", "retention_repeatable_installed", {
        everyMs: res.everyMs,
      });
    }
  })
  .catch((err) =>
    logStructured("error", "retention_repeatable_install_failed", {
      error: err instanceof Error ? err.message : String(err),
    }),
  );

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
  ]);
  clearTimeout(forceExit);
  console.info("[ops-worker] All workers closed — exiting");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
