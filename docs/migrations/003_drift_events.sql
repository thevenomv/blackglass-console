-- Migration 003 — Drift events store
-- Stores the latest computed drift events per host as a JSONB array.
-- "Latest" = the output of the most recent scan; older scans are overwritten
-- (drift history day-counts are in blackglass_drift_history, not here).
--
-- Run once against the target database before activating DATABASE_URL.

CREATE TABLE IF NOT EXISTS blackglass_drift_events (
  host_id     TEXT          NOT NULL PRIMARY KEY,
  events      JSONB         NOT NULL DEFAULT '[]'::jsonb,
  tenant_id   TEXT          DEFAULT NULL,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for tenant-scoped queries (Stage 3 multi-tenant).
CREATE INDEX IF NOT EXISTS blackglass_drift_events_tenant_idx
  ON blackglass_drift_events (tenant_id);

-- Row-level security (uncomment at Stage 3 when multi-tenant is active):
-- ALTER TABLE blackglass_drift_events ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON blackglass_drift_events
--   USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true));
