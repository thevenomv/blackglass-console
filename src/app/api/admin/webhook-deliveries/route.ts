/**
 * GET /api/admin/webhook-deliveries
 *
 * Returns the most recent webhook delivery attempts from the BullMQ
 * outbound-webhook queue (introduced in P1a #19).  Combines completed +
 * failed jobs so operators can see "the last 50 attempts and which ones
 * needed retries / are still failing".
 *
 * Optional ?status= filter: completed | failed | active | all (default all).
 *
 * Auth: same gate as the other /api/admin/* routes (owner+admin).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { QUEUE_NAMES } from "@/lib/server/queue/config";

type DeliveryRow = {
  id: string;
  status: "completed" | "failed" | "active" | "waiting" | "delayed";
  url: string;
  scanId: string | null;
  tenantId: string | null;
  attemptsMade: number;
  enqueuedAt: string;
  finishedAt: string | null;
  failedReason?: string;
};

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  const auth = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!auth.ok) return auth.response;

  const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
  if (!redisUrl) {
    return NextResponse.json(
      {
        redis_configured: false,
        deliveries: [],
        note: "REDIS_QUEUE_URL is not set — outbound webhooks deliver inline; no log to surface.",
      },
      { headers: { "x-request-id": requestId } },
    );
  }

  const url = new URL(request.url);
  const filter = (url.searchParams.get("status") ?? "all").toLowerCase();
  const allowed: ReadonlyArray<DeliveryRow["status"]> =
    filter === "completed"
      ? ["completed"]
      : filter === "failed"
        ? ["failed"]
        : filter === "active"
          ? ["active", "waiting", "delayed"]
          : ["completed", "failed", "active", "waiting", "delayed"];

  const { Queue } = await import("bullmq");
  const tlsOpts = redisUrl.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
  const q = new Queue(QUEUE_NAMES.WEBHOOKS, { connection: { url: redisUrl, ...tlsOpts } });
  try {
    const jobs = await q.getJobs(allowed as Array<DeliveryRow["status"]>, 0, 49, false);
    const rows: DeliveryRow[] = await Promise.all(
      jobs.map(async (j) => {
        const state = (await j.getState()) as DeliveryRow["status"];
        const data = (j.data ?? {}) as {
          url?: string;
          scanId?: string;
          tenantId?: string;
        };
        return {
          id: j.id ?? `n${j.timestamp}`,
          status: state,
          url: data.url ?? "(unknown)",
          scanId: data.scanId ?? null,
          tenantId: data.tenantId ?? null,
          attemptsMade: j.attemptsMade ?? 0,
          enqueuedAt: new Date(j.timestamp).toISOString(),
          finishedAt: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
          failedReason: j.failedReason ?? undefined,
        };
      }),
    );

    return NextResponse.json(
      {
        redis_configured: true,
        deliveries: rows.sort(
          (a, b) => new Date(b.enqueuedAt).getTime() - new Date(a.enqueuedAt).getTime(),
        ),
      },
      { headers: { "x-request-id": requestId } },
    );
  } finally {
    await q.close();
  }
}
