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

import { QUEUE_NAMES, RETRY_POLICIES, RETENTION, redisConnectionFromUrl } from "./config";

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
  /**
   * Host id within the scan. Required for correct BullMQ deduplication:
   * N hosts sharing one webhook URL each need their own queue entry.
   * Without this, all N jobs get the same jobId and BullMQ only delivers
   * the first host's findings (QUEUE-02).
   */
  hostId?: string;
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
      connection: redisConnectionFromUrl(redisUrl),
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
  const urlHash = Buffer.from(payload.url).toString("base64url").slice(0, 16);
  await queue.add("deliver", payload, {
    // QUEUE-02: include hostId so N hosts sharing one webhook URL each get a
    // distinct jobId. Without hostId, BullMQ deduplicates all N to the first
    // host's job and discards the remaining hosts' findings.
    jobId: `${payload.scanId}-${payload.hostId ?? "all"}-${urlHash}`,
  });
  return true;
}
