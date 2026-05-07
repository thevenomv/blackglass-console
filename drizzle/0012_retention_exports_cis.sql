-- Migration 0012: per-tenant retention policies, data export jobs, and
-- CIS evidence-of-control mappings.

-- ── Retention policies ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saas_retention_policies (
  tenant_id              UUID PRIMARY KEY REFERENCES saas_tenants(id) ON DELETE CASCADE,
  drift_events_days      INTEGER,
  baseline_snapshots_days INTEGER,
  audit_events_days      INTEGER,
  evidence_bundles_days  INTEGER,
  updated_by             TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE saas_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY saas_retention_policies_tenant_isolation ON saas_retention_policies
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = '1'
  );

-- ── Data export jobs ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE data_export_status AS ENUM (
    'queued', 'running', 'ready', 'failed', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS saas_data_exports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  status        data_export_status NOT NULL DEFAULT 'queued',
  requested_by  TEXT,
  deliver_to    TEXT,
  object_key    TEXT,
  size_bytes    INTEGER,
  error_message TEXT,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saas_data_exports_tenant_idx ON saas_data_exports (tenant_id, created_at DESC);

ALTER TABLE saas_data_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY saas_data_exports_tenant_isolation ON saas_data_exports
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = '1'
  );

-- ── CIS evidence-of-control mappings ──────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE cis_mapping_status AS ENUM ('active', 'not_applicable', 'draft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS saas_cis_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  control_id      TEXT NOT NULL,
  control_title   TEXT NOT NULL,
  drift_category  TEXT NOT NULL,
  status          cis_mapping_status NOT NULL DEFAULT 'active',
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS saas_cis_mappings_tenant_control_cat_uq
  ON saas_cis_mappings (tenant_id, control_id, drift_category);

ALTER TABLE saas_cis_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY saas_cis_mappings_tenant_isolation ON saas_cis_mappings
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = '1'
  );
