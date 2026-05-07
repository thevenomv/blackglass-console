-- Migration 0011: per-tenant drift mute / snooze patterns.

CREATE TABLE IF NOT EXISTS saas_drift_mutes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  category       TEXT NOT NULL,
  title_pattern  TEXT NOT NULL,
  host_id        TEXT,
  reason         TEXT,
  muted_until    TIMESTAMPTZ,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saas_drift_mutes_tenant_idx ON saas_drift_mutes (tenant_id);

ALTER TABLE saas_drift_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY saas_drift_mutes_tenant_isolation ON saas_drift_mutes
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = '1'
  );
