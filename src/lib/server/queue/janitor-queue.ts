/**
 * BullMQ queue for Charon (read-only cloud scans).
 * Consumer: `src/worker/ops/index.ts` → `executeJanitorScanJob`.
 */

import { randomUUID } from "node:crypto";
import { QUEUE_NAMES, RETRY_POLICIES, RETENTION } from "./config";

export type JanitorScanJobPayload = {
  tenantId: string;
  accountId: string;
  requestId?: string;
  actorUserId?: string | null;
};

const QUEUE_KEY = "__blackglass_janitor_queue_v1" as const;
type G = typeof globalThis & { [QUEUE_KEY]?: import("bullmq").Queue<JanitorScanJobPayload> };

export async function getJanitorQueue(): Promise<import("bullmq").Queue<JanitorScanJobPayload> | null> {
  const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
  if (!redisUrl) return null;

  const g = globalThis as G;
  if (!g[QUEUE_KEY]) {
    const { Queue } = await import("bullmq");
    const tlsOpts = redisUrl.startsWith("rediss://")
      ? { tls: { rejectUnauthorized: false } }
      : {};
    g[QUEUE_KEY] = new Queue<JanitorScanJobPayload>(QUEUE_NAMES.JANITOR, {
      connection: { url: redisUrl, ...tlsOpts },
      defaultJobOptions: {
        ...RETRY_POLICIES.janitor,
        ...RETENTION.janitor,
      },
    });
  }
  return g[QUEUE_KEY]!;
}

export async function enqueueJanitorScanJob(payload: JanitorScanJobPayload): Promise<boolean> {
  const queue = await getJanitorQueue();
  if (!queue) return false;
  const jobId = `janitor-${payload.accountId}-${randomUUID()}`;
  await queue.add("scan", payload, { jobId });
  return true;
}
