/**
 * BLACKGLASS scan worker — BullMQ consumer.
 *
 * Run this alongside the Next.js web process when REDIS_QUEUE_URL is set:
 *
 *   node --import tsx/esm src/worker/scan-worker.ts
 *   # or via a dedicated Dockerfile / DO App Platform worker component
 *
 * The worker picks up ScanJobPayload messages from the "blackglass:scans"
 * queue and executes the full SSH fan-out + drift computation there, keeping
 * the web tier free for HTTP requests.
 *
 * Environment variables required (same as web tier):
 *   REDIS_QUEUE_URL         — Redis connection URL
 *   COLLECTOR_HOST_*        — SSH host configuration
 *   SSH_PRIVATE_KEY / SECRET_PROVIDER / ...
 *   BASELINE_STORE_PATH or Spaces env (DO_SPACES_*)
 *
 * Env loading: In local development, create a `.env.local` file and run via
 *   `npm run worker` — tsx auto-loads .env.local via tsconfig paths.
 *   In production (DO App Platform / Docker), environment variables are
 *   injected by the platform and dotenv is not required.
 *
 * Concurrency: set WORKER_CONCURRENCY (default 4) to control how many scans
 * run in parallel.  Each scan already uses COLLECTOR_MAX_PARALLEL_SSH for
 * intra-scan SSH concurrency.
 *
 * Multi-tenant: queue payloads may include `saasTenantId` for correlation. The worker
 * must remain stateless — do not reuse SSH keys or host credentials across jobs;
 * load per-job config from env (today) or per-tenant secret storage (future) inside
 * the job handler and clear sensitive references before returning.
 */

import { Worker, Queue } from "bullmq";
import { executeDriftScanJob } from "@/lib/server/services/scan-drift-job";
import { QUEUE_NAME, type ScanJobPayload } from "@/lib/server/queue/scan-queue";
import { logStructured } from "@/lib/server/log";

const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
if (!redisUrl) {
  console.error("[scan-worker] REDIS_QUEUE_URL is not set — worker cannot start");
  process.exit(1);
}

const concurrency = parseInt(process.env.WORKER_CONCURRENCY ?? "4", 10);

console.info(`[scan-worker] Starting — queue=${QUEUE_NAME} concurrency=${concurrency}`);

const metricsQueue = new Queue<ScanJobPayload>(QUEUE_NAME, {
  connection: { url: redisUrl },
});

const worker = new Worker<ScanJobPayload>(
  QUEUE_NAME,
  async (job) => {
    const { jobId, collectOpts, saasTenantId } = job.data;
    console.info(
      `[scan-worker] Processing job ${job.id} — scanId=${jobId} attempt=${job.attemptsMade + 1}` +
        (saasTenantId ? ` saasTenantId=${saasTenantId}` : ""),
    );
    if (saasTenantId) {
      logStructured("info", "scan_job_tenant_context", { jobId, saasTenantId, attempt: job.attemptsMade + 1 });
    }
    await executeDriftScanJob(jobId, collectOpts);
  },
  {
    connection: { url: redisUrl },
    concurrency,
    // Retry up to 3 times with exponential back-off (2 s, 4 s, 8 s)
    settings: {
      backoffStrategy: (attemptsMade) => Math.pow(2, attemptsMade) * 1000,
    },
    // Stalled job detection: re-queue jobs that stop heartbeating after 30 s
    stalledInterval: 30_000,
    maxStalledCount: 2,
  },
);

worker.on("completed", (job) => {
  console.info(`[scan-worker] Job ${job.id} completed`);
  void metricsQueue
    .getJobCounts("waiting", "active", "delayed", "completed", "failed")
    .then((counts) => {
      logStructured("info", "scan_queue_metrics", { ...counts, lastJobId: job.id });
    })
    .catch(() => {
      logStructured("warn", "scan_queue_metrics_unavailable", {});
    });
});

worker.on("failed", (job, err) => {
  const isFinal = (job?.attemptsMade ?? 0) >= (job?.opts?.attempts ?? 1);
  logStructured(isFinal ? "error" : "warn", "scan_job_failed", {
    jobId: job?.id,
    scanId: job?.data?.jobId,
    attempt: job?.attemptsMade,
    final: isFinal,
    error: err instanceof Error ? err.message : String(err),
  });
});

worker.on("stalled", (jobId) => {
  logStructured("warn", "scan_job_stalled", { jobId });
});

// Graceful shutdown — drain active jobs before exit
async function shutdown(signal: string) {
  console.info(`[scan-worker] ${signal}: closing worker...`);
  await worker.close();
  await metricsQueue.close();
  console.info("[scan-worker] Worker closed — exiting");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
