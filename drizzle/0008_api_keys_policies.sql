-- Migration 0008: API keys + host policies
-- Adds saas_api_keys and saas_host_policies tables.

-- ── API keys ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saas_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  key_hash     TEXT NOT NULL UNIQUE,       -- SHA-256 hex of the raw key
  label        TEXT NOT NULL,
  scopes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by   TEXT,
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saas_api_keys_tenant_idx ON saas_api_keys (tenant_id);

-- Row-level security: tenants see only their own keys
ALTER TABLE saas_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY saas_api_keys_tenant_isolation ON saas_api_keys
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = '1'
  );

-- ── Host policies ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saas_host_policies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,
  condition_key    TEXT NOT NULL,
  condition_value  TEXT NOT NULL,
  severity         TEXT NOT NULL DEFAULT 'high',
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saas_host_policies_tenant_idx ON saas_host_policies (tenant_id);

ALTER TABLE saas_host_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY saas_host_policies_tenant_isolation ON saas_host_policies
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = '1'
  );
