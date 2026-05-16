/**
 * BullMQ-backed data-export queue.
 *
 * Producer for tenant data exports. The consumer lives in
 * `src/worker/ops/index.ts` and calls `runExportJob()` from
 * `services/export-service.ts`.
 *
 * When REDIS_QUEUE_URL is unset the producer returns false so the caller
 * (`enqueueExport()`) falls back to the legacy `setImmediate()` in-process
 * path — keeps small / dev deployments working with zero infra.
 */

import { QUEUE_NAMES, RETRY_POLICIES, RETENTION } from "./config";

export interface ExportJobPayload {
  exportId: string;
  tenantId: string;
}

const QUEUE_KEY = "__blackglass_export_queue_v1" as const;
type G = typeof globalThis & { [QUEUE_KEY]?: import("bullmq").Queue<ExportJobPayload> };

export async function getExportQueue(): Promise<import("bullmq").Queue<ExportJobPayload> | null> {
  const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
  if (!redisUrl) return null;

  const g = globalThis as G;
  if (!g[QUEUE_KEY]) {
    const { Queue } = await import("bullmq");
    g[QUEUE_KEY] = new Queue<ExportJobPayload>(QUEUE_NAMES.EXPORTS, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        ...RETRY_POLICIES.export,
        ...RETENTION.exports,
      },
    });
  }
  return g[QUEUE_KEY]!;
}

export async function enqueueExportJob(payload: ExportJobPayload): Promise<boolean> {
  const queue = await getExportQueue();
  if (!queue) return false;
  await queue.add("run", payload, { jobId: `export-${payload.exportId}` });
  return true;
}
