-- SaaS core: tenants, subscriptions, memberships, audit (Clerk org sync).
-- Apply: psql "$DATABASE_URL" -f docs/migrations/004_saas_clerk_core.sql

CREATE TYPE tenant_role AS ENUM (
  'owner',
  'admin',
  'operator',
  'viewer',
  'guest_auditor'
);

CREATE TYPE subscription_status AS ENUM (
  'trialing',
  'active',
  'trial_expired',
  'canceled',
  'custom'
);

CREATE TABLE IF NOT EXISTS saas_tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_org_id TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  plan_code               TEXT NOT NULL,
  status                  subscription_status NOT NULL,
  trial_ends_at           TIMESTAMPTZ,
  current_period_ends_at  TIMESTAMPTZ,
  host_limit              INTEGER NOT NULL,
  paid_seat_limit         INTEGER NOT NULL,
  features                JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_subscriptions_tenant_idx ON saas_subscriptions (tenant_id);

CREATE TABLE IF NOT EXISTS saas_tenant_memberships (
  tenant_id   UUID NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  role        tenant_role NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  invited_by  TEXT,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS saas_memberships_user_idx ON saas_tenant_memberships (user_id);

CREATE TABLE IF NOT EXISTS saas_audit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_audit_tenant_ts_idx ON saas_audit_events (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saas_security_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  user_id     TEXT,
  severity    TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_security_tenant_ts_idx ON saas_security_events (tenant_id, created_at DESC);
