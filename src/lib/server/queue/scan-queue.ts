/**
 * BullMQ-backed scan job queue.
 *
 * Used only when REDIS_QUEUE_URL is set — the scan POST route gracefully falls
 * back to in-process execution when the queue is not configured (Stage 0/1).
 *
 * Worker entry: src/worker/scan/index.ts
 *
 * Queue names are exported from QUEUE_NAMES so that the worker, routes, and
 * observability code share a single source of truth without string literals.
 *
 * Next steps (Stage 2):
 *  - Set REDIS_QUEUE_URL to your managed Redis URL.
 *  - Deploy the worker as a separate container/process alongside the web app.
 *  - The web tier becomes a thin gateway; SSH fan-out moves to the worker.
 */

import type { CollectScanOptions } from "@/lib/server/collector/types";
import { QUEUE_NAMES, RETRY_POLICIES, RETENTION } from "./config";

/** Re-export from config.ts so existing imports keep working. */
export { QUEUE_NAMES };

/** @deprecated Use QUEUE_NAMES.SCANS — kept for temporary backwards compat */
export const QUEUE_NAME = QUEUE_NAMES.SCANS;

export type ScanJobPayload = {
  jobId: string;
  collectOpts: CollectScanOptions;
  /** Saas workspace id (`saas_tenants.id`) when the job was enqueued from Clerk mode — for logs and future per-tenant secrets. */
  saasTenantId?: string;
  /** Correlates web POST → worker logs → audit (`emitSaasAudit` metadata). */
  requestId?: string;
};

// ---------------------------------------------------------------------------
// Lazy-initialised Queue singleton (web tier — enqueue only)
// ---------------------------------------------------------------------------

const QUEUE_KEY = "__blackglass_scan_queue_v1" as const;
type G = typeof globalThis & { [QUEUE_KEY]?: import("bullmq").Queue<ScanJobPayload> };

/**
 * Returns a BullMQ Queue instance when REDIS_QUEUE_URL is set, or null when
 * running in in-process mode.  The instance is cached on `globalThis` so it
 * survives Next.js hot-reload.
 */
export async function getScanQueue(): Promise<import("bullmq").Queue<ScanJobPayload> | null> {
  const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
  if (!redisUrl) return null;

  const g = globalThis as G;
  if (!g[QUEUE_KEY]) {
    const { Queue } = await import("bullmq");
    const tlsOpts = redisUrl.startsWith("rediss://")
      ? { tls: { rejectUnauthorized: false } }
      : {};
    g[QUEUE_KEY] = new Queue<ScanJobPayload>(QUEUE_NAME, {
      connection: { url: redisUrl, ...tlsOpts },
      defaultJobOptions: {
        ...RETRY_POLICIES.scan,
        ...RETENTION.scans,
      },
    });
  }
  return g[QUEUE_KEY]!;
}

// ---------------------------------------------------------------------------
// Worker-presence probe
// ---------------------------------------------------------------------------

/**
 * Returns the number of currently-connected scan workers as reported by
 * BullMQ. Result is cached for `WORKER_PROBE_CACHE_MS` to keep the
 * /api/v1/scans hot path fast — a fresh probe per request would add a
 * Redis round-trip to every scan enqueue, which is wasteful when the
 * answer almost always stays the same for hours at a time.
 *
 * Returns `null` when there's no queue configured (caller should treat
 * that as "in-process mode — proceed without a worker probe").
 *
 * Why this exists: when REDIS_QUEUE_URL is set on the web tier but no
 * scan-worker component is deployed (a real production failure mode
 * we hit on DigitalOcean App Platform after adding Redis for rate
 * limiting), `queue.add()` silently succeeds and the job sits in the
 * queue forever. Without this probe the only signal to the user is
 * "Run scan" hanging forever in the UI. With it, the route can fall
 * back to in-process execution and the scan still completes.
 */
const WORKER_PROBE_CACHE_MS = 15_000;
type WorkerCacheEntry = { count: number; checkedAt: number };
let _workerCache: WorkerCacheEntry | null = null;

export async function getActiveScanWorkerCount(): Promise<number | null> {
  const queue = await getScanQueue();
  if (!queue) return null;

  if (_workerCache && Date.now() - _workerCache.checkedAt < WORKER_PROBE_CACHE_MS) {
    return _workerCache.count;
  }

  try {
    // BullMQ's getWorkers returns the list of workers that have sent a
    // heartbeat to Redis in the last ~30s (the same window used for
    // stalled-job detection). An empty array means nothing is
    // consuming this queue right now.
    const workers = await queue.getWorkers();
    _workerCache = { count: workers.length, checkedAt: Date.now() };
    return workers.length;
  } catch (err) {
    console.warn(
      "[scan-queue] worker probe failed — assuming 0 workers and falling back:",
      err instanceof Error ? err.message : err,
    );
    // Cache the failure briefly so we don't hammer Redis every scan
    // when it's having a bad time. Treat probe failure as "no
    // worker" so the caller falls back to in-process execution.
    _workerCache = { count: 0, checkedAt: Date.now() };
    return 0;
  }
}

/** Clear the worker cache. Test-only — avoid in production code paths. */
export function _clearScanWorkerCacheForTests(): void {
  _workerCache = null;
}
