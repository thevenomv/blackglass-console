-- Per-tenant Charon policy knobs (tag filters, min score, digest opt-in).

ALTER TABLE "saas_tenants" ADD COLUMN IF NOT EXISTS "charon_policies" jsonb NOT NULL DEFAULT '{}'::jsonb;
