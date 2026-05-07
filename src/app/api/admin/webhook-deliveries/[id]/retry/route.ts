/**
 * POST /api/admin/webhook-deliveries/[id]/retry
 *
 * Re-queue a failed webhook delivery job from the BullMQ DLQ.  Idempotent —
 * BullMQ's job.retry() only succeeds if the job is in the failed state.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonError } from "@/lib/server/http/json-error";
import { QUEUE_NAMES } from "@/lib/server/queue/config";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  const { id } = await params;

  if (!id || id.length > 200) {
    return jsonError(400, "invalid_id", "Invalid job id.", requestId);
  }

  const auth = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!auth.ok) return auth.response;

  const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
  if (!redisUrl) {
    return jsonError(503, "queue_unavailable", "REDIS_QUEUE_URL not set.", requestId);
  }

  const { Queue } = await import("bullmq");
  const tlsOpts = redisUrl.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
  const q = new Queue(QUEUE_NAMES.WEBHOOKS, { connection: { url: redisUrl, ...tlsOpts } });
  try {
    const job = await q.getJob(id);
    if (!job) {
      return jsonError(404, "not_found", "Job not found.", requestId);
    }
    const state = await job.getState();
    if (state !== "failed") {
      return jsonError(
        409,
        "not_retryable",
        `Job is in state '${state}'; only failed jobs can be retried.`,
        requestId,
      );
    }
    await job.retry();
    return NextResponse.json({ ok: true, id });
  } finally {
    await q.close();
  }
}
