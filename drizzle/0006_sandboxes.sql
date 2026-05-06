-- Migration 0006: per-tenant ephemeral sandbox Droplets
-- Applied: 2026-05-06

CREATE TYPE sandbox_status AS ENUM (
  'provisioning',
  'ready',
  'seeding',
  'error',
  'destroying',
  'destroyed'
);

CREATE TABLE IF NOT EXISTS saas_sandboxes (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid         NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  droplet_id        text,
  droplet_ip        text,
  region            text         NOT NULL DEFAULT 'lon1',
  host_id           uuid         REFERENCES saas_collector_hosts(id) ON DELETE SET NULL,
  credential_id     uuid         REFERENCES tenant_credentials(id) ON DELETE SET NULL,
  status            sandbox_status NOT NULL DEFAULT 'provisioning',
  ttl_expires_at    timestamptz,
  seed_phase        integer      NOT NULL DEFAULT 0,
  drift_seeded_at   timestamptz,
  error_message     text,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

-- One active sandbox per tenant (multiple 'destroyed' rows are allowed for history).
CREATE UNIQUE INDEX IF NOT EXISTS saas_sandboxes_tenant_active_uq
  ON saas_sandboxes (tenant_id)
  WHERE status <> 'destroyed';

-- RLS — tenants may only see their own sandbox rows.
ALTER TABLE saas_sandboxes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'saas_sandboxes' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON saas_sandboxes
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

-- Allow the app bypass role to skip RLS (worker / provisioner).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'saas_sandboxes' AND policyname = 'bypass_rls'
  ) THEN
    CREATE POLICY bypass_rls ON saas_sandboxes
      USING (current_setting('app.bypass_rls', true) = 'on');
  END IF;
END $$;
