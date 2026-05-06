/**
 * GET /api/admin/queues
 *
 * Returns a real-time snapshot of BullMQ queue health: waiting, active,
 * delayed, failed, and stalled job counts for every managed queue.
 *
 * Requires Redis (REDIS_QUEUE_URL).  When Redis is not configured, returns
 * a 200 with `redis_configured: false` so uptime monitors do not page.
 *
 * Auth: owner/admin only (`secrets.manage` permission — same gate as the
 * rate-limits admin route).
 *
 * Response shape:
 * {
 *   redis_configured: true,
 *   generatedAt: ISO string,
 *   queues: {
 *     [queueName]: {
 *       waiting: number,
 *       active: number,
 *       delayed: number,
 *       failed: number,
 *       completed_recent: number,  // removeOnComplete window, not total ever
 *       oldest_waiting_ms: number | null
 *     }
 *   }
 * }
 */

import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { QUEUE_NAMES } from "@/lib/server/queue/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type QueueStats = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed_recent: number;
  oldest_waiting_ms: number | null;
};

async function statsForQueue(
  Queue: typeof import("bullmq").Queue,
  name: string,
  redisUrl: string,
): Promise<QueueStats> {
  const tlsOpts = redisUrl.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
  const q = new Queue(name, { connection: { url: redisUrl, ...tlsOpts } });
  try {
    const [waiting, active, delayed, failed, completed] = await Promise.all([
      q.getWaitingCount(),
      q.getActiveCount(),
      q.getDelayedCount(),
      q.getFailedCount(),
      q.getCompletedCount(),
    ]);

    // Find oldest waiting job for latency estimation.
    let oldest_waiting_ms: number | null = null;
    if (waiting > 0) {
      const [oldestJob] = await q.getJobs(["waiting"], 0, 0, true); // oldest first
      if (oldestJob?.timestamp) {
        oldest_waiting_ms = Date.now() - oldestJob.timestamp;
      }
    }

    return { waiting, active, delayed, failed, completed_recent: completed, oldest_waiting_ms };
  } finally {
    await q.close();
  }
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  const auth = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!auth.ok) return auth.response;

  const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
  if (!redisUrl) {
    return NextResponse.json(
      { redis_configured: false, generatedAt: new Date().toISOString() },
      { headers: { "x-request-id": requestId } },
    );
  }

  const { Queue } = await import("bullmq");

  const entries = await Promise.allSettled(
    Object.entries(QUEUE_NAMES).map(async ([key, name]) => {
      const stats = await statsForQueue(Queue, name, redisUrl);
      return [name, stats] as const;
    }),
  );

  const queues: Record<string, QueueStats | { error: string }> = {};
  for (const result of entries) {
    if (result.status === "fulfilled") {
      const [name, stats] = result.value;
      queues[name] = stats;
    } else {
      // Surface per-queue errors without failing the whole response.
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      queues["unknown"] = { error: msg };
    }
  }

  return NextResponse.json(
    { redis_configured: true, generatedAt: new Date().toISOString(), queues },
    { headers: { "x-request-id": requestId } },
  );
}
