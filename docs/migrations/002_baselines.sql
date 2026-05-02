-- BLACKGLASS baselines + drift history Postgres tables.
-- Apply with: psql "$DATABASE_URL" -f docs/migrations/002_baselines.sql
--
-- tenant_id is included from day one (NULL = single-tenant).
-- Add Row-Level Security at Stage 3:
--   ALTER TABLE blackglass_baselines ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON blackglass_baselines
--     USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id'));

CREATE TABLE IF NOT EXISTS blackglass_baselines (
  host_id       TEXT        NOT NULL,
  hostname      TEXT        NOT NULL,
  collected_at  TIMESTAMPTZ NOT NULL,
  data          JSONB       NOT NULL,
  tenant_id     TEXT        DEFAULT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (host_id)
);

CREATE INDEX IF NOT EXISTS blackglass_baselines_tenant_idx
  ON blackglass_baselines (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blackglass_drift_history (
  ymd                 DATE    NOT NULL,
  total_new_findings  INTEGER NOT NULL DEFAULT 0,
  tenant_id           TEXT    DEFAULT NULL,
  PRIMARY KEY (ymd)
);

CREATE INDEX IF NOT EXISTS blackglass_drift_history_tenant_idx
  ON blackglass_drift_history (tenant_id)
  WHERE tenant_id IS NOT NULL;
