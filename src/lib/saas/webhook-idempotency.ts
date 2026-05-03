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

/**
 * Claims an idempotency key for a webhook delivery. Returns true if this replica
 * should process the event, false if a previous delivery already claimed it
 * (duplicate). Uses Postgres when DATABASE_URL is set; otherwise a bounded
 * in-memory set (single-instance dev only).
 */
export async function claimWebhookEvent(
  source: WebhookIdempotencySource,
  eventKey: string,
): Promise<boolean> {
  const db = tryGetDb();
  if (!db) {
    return claimInMemory(source, eventKey);
  }
  try {
    const rows = await db
      .insert(schema.saasWebhookIdempotency)
      .values({ source, eventKey })
      .onConflictDoNothing({
        target: [schema.saasWebhookIdempotency.source, schema.saasWebhookIdempotency.eventKey],
      })
      .returning({ id: schema.saasWebhookIdempotency.id });
    return rows.length > 0;
  } catch (e) {
    console.error("[webhook-idempotency] insert failed", e);
    return false;
  }
}
