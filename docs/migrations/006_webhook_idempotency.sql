-- Shared webhook idempotency keys (Stripe event.id, Clerk svix-id) for multi-instance deploys.
-- Applied alongside Drizzle schema in src/db/schema.ts (saas_webhook_idempotency).

CREATE TABLE IF NOT EXISTS saas_webhook_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  event_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_webhook_idempotency_source_event_uq UNIQUE (source, event_key)
);

CREATE INDEX IF NOT EXISTS saas_webhook_idempotency_created_at_idx
  ON saas_webhook_idempotency (created_at);
