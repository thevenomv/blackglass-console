/**
 * BullMQ-backed scan job queue.
 *
 * Used only when REDIS_QUEUE_URL is set — the scan POST route gracefully falls
 * back to in-process execution when the queue is not configured (Stage 0/1).
 *
 * Worker entry: src/worker/scan-worker.ts
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
    g[QUEUE_KEY] = new Queue<ScanJobPayload>(QUEUE_NAME, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        ...RETRY_POLICIES.scan,
        ...RETENTION.scans,
      },
    });
  }
  return g[QUEUE_KEY]!;
}
