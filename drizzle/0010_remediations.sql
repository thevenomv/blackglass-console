-- Migration 0010: AI remediation recommendations from blackglass-remediator.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'remediation_status') THEN
    CREATE TYPE remediation_status AS ENUM (
      'draft',
      'awaiting_approval',
      'approved',
      'rejected',
      'expired'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS saas_remediations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  remediation_id    TEXT NOT NULL UNIQUE,
  drift_event_id    TEXT,
  host_id           TEXT,
  scan_id           TEXT,
  status            remediation_status NOT NULL DEFAULT 'awaiting_approval',
  risk_policy_tier  TEXT NOT NULL,
  summary           TEXT NOT NULL,
  plan              JSONB NOT NULL,
  approved_by       TEXT,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saas_remediations_tenant_idx ON saas_remediations (tenant_id);
CREATE INDEX IF NOT EXISTS saas_remediations_drift_event_idx ON saas_remediations (drift_event_id);

ALTER TABLE saas_remediations ENABLE ROW LEVEL SECURITY;

CREATE POLICY saas_remediations_tenant_isolation ON saas_remediations
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = '1'
  );
