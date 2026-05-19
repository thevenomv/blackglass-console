import { and, eq } from "drizzle-orm";
import { tryGetDb, schema } from "@/db";

export type WebhookIdempotencySource = "stripe" | "clerk";

const MEM_CAP = 2000;
const memoryBySource: Record<WebhookIdempotencySource, Set<string>> = {
  stripe: new Set(),
  clerk: new Set(),
};

function claimInMemory(source: WebhookIdempotencySource, eventKey: string): boolean {
  const set = memoryBySource[source];
  if (set.has(eventKey)) return false;
  if (set.size >= MEM_CAP) set.clear();
  set.add(eventKey);
  return true;
}

function releaseInMemory(source: WebhookIdempotencySource, eventKey: string): void {
  memoryBySource[source].delete(eventKey);
}

/**
 * Claims an idempotency key for a webhook delivery. Returns true if this replica
 * should process the event, false if a previous delivery already claimed it
 * (duplicate). Uses Postgres when DATABASE_URL is set; otherwise a bounded
 * in-memory set (single-instance dev only).
 *
 * Throws on DB error so callers must return 500 and let the provider retry,
 * rather than silently dropping the event (BILL-02).
 */
export async function claimWebhookEvent(
  source: WebhookIdempotencySource,
  eventKey: string,
): Promise<boolean> {
  const db = tryGetDb();
  if (!db) {
    return claimInMemory(source, eventKey);
  }
  // Let DB errors propagate — callers catch and return 500 so Stripe retries.
  const rows = await db
    .insert(schema.saasWebhookIdempotency)
    .values({ source, eventKey })
    .onConflictDoNothing({
      target: [schema.saasWebhookIdempotency.source, schema.saasWebhookIdempotency.eventKey],
    })
    .returning({ id: schema.saasWebhookIdempotency.id });
  return rows.length > 0;
}

/**
 * Releases an idempotency key after a handler failure so the provider can
 * retry the event. Call this before returning 500 to prevent the next
 * delivery from being treated as a duplicate (BILL-01).
 */
export async function releaseWebhookEvent(
  source: WebhookIdempotencySource,
  eventKey: string,
): Promise<void> {
  const db = tryGetDb();
  if (!db) {
    releaseInMemory(source, eventKey);
    return;
  }
  try {
    await db
      .delete(schema.saasWebhookIdempotency)
      .where(
        and(
          eq(schema.saasWebhookIdempotency.source, source),
          eq(schema.saasWebhookIdempotency.eventKey, eventKey),
        ),
      );
  } catch (e) {
    console.error("[webhook-idempotency] release failed", e);
  }
}
