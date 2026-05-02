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
 */

import { Worker } from "bullmq";
import { executeDriftScanJob } from "@/lib/server/services/scan-drift-job";
import { QUEUE_NAME, type ScanJobPayload } from "@/lib/server/queue/scan-queue";

const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
if (!redisUrl) {
  console.error("[scan-worker] REDIS_QUEUE_URL is not set — worker cannot start");
  process.exit(1);
}

const concurrency = parseInt(process.env.WORKER_CONCURRENCY ?? "4", 10);

console.info(`[scan-worker] Starting — queue=${QUEUE_NAME} concurrency=${concurrency}`);

const worker = new Worker<ScanJobPayload>(
  QUEUE_NAME,
  async (job) => {
    const { jobId, collectOpts } = job.data;
    console.info(`[scan-worker] Processing job ${job.id} — scanId=${jobId}`);
    await executeDriftScanJob(jobId, collectOpts);
  },
  {
    connection: { url: redisUrl },
    concurrency,
  },
);

worker.on("completed", (job) => {
  console.info(`[scan-worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[scan-worker] Job ${job?.id} failed:`, err);
});

// Graceful shutdown — drain active jobs before exit
async function shutdown(signal: string) {
  console.info(`[scan-worker] ${signal}: closing worker...`);
  await worker.close();
  console.info("[scan-worker] Worker closed — exiting");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
