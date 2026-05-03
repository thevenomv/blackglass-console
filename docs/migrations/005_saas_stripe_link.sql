-- Links Stripe billing to saas_subscriptions for webhook + portal verification.
-- Apply after 004_saas_clerk_core.sql

ALTER TABLE saas_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS saas_subscriptions_stripe_customer_uq
  ON saas_subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
