/**
 * BullMQ-backed outbound webhook delivery queue.
 *
 * - Used when REDIS_QUEUE_URL is set so failed deliveries auto-retry with
 *   exponential backoff (config.ts → RETRY_POLICIES.webhook).
 * - Failed jobs that exhaust all attempts land in the BullMQ failed set,
 *   which acts as a dead-letter queue surfaced by GET /api/admin/webhooks/dlq.
 * - When Redis is unset, callers should fall back to inline delivery via
 *   dispatchDriftWebhook(); this module is a no-op singleton in that mode.
 *
 * Producer lives in this file; the consumer worker can be added later under
 * src/worker/webhook-worker.ts once the operational appetite is there.
 */

import { QUEUE_NAMES, RETRY_POLICIES, RETENTION } from "./config";

export interface WebhookJobPayload {
  url: string;
  /** Pre-serialized JSON body — already platform-formatted (Slack/PagerDuty/generic). */
  body: string;
  /** Outbound HTTP headers including Content-Type, User-Agent, optional HMAC. */
  headers: Record<string, string>;
  /** Tenant id for audit + DLQ filtering. */
  tenantId?: string;
  /** Scan id for correlation with the originating scan job. */
  scanId: string;
}

const QUEUE_KEY = "__blackglass_webhook_queue_v1" as const;
type G = typeof globalThis & { [QUEUE_KEY]?: import("bullmq").Queue<WebhookJobPayload> };

export async function getWebhookQueue(): Promise<import("bullmq").Queue<WebhookJobPayload> | null> {
  const redisUrl = process.env.REDIS_QUEUE_URL?.trim();
  if (!redisUrl) return null;

  const g = globalThis as G;
  if (!g[QUEUE_KEY]) {
    const { Queue } = await import("bullmq");
    g[QUEUE_KEY] = new Queue<WebhookJobPayload>(QUEUE_NAMES.WEBHOOKS, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        ...RETRY_POLICIES.webhook,
        ...RETENTION.webhooks,
      },
    });
  }
  return g[QUEUE_KEY]!;
}

/**
 * Enqueue a webhook delivery.  Returns true when queued, false when there
 * is no Redis configured (caller should fall back to inline delivery).
 */
export async function enqueueWebhookDelivery(payload: WebhookJobPayload): Promise<boolean> {
  const queue = await getWebhookQueue();
  if (!queue) return false;
  await queue.add("deliver", payload, {
    jobId: `${payload.scanId}-${Buffer.from(payload.url).toString("base64url").slice(0, 16)}`,
  });
  return true;
}
