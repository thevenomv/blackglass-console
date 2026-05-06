-- Migration: drift_events partitioned table
--
-- Creates a range-partitioned replacement for the drift events store.
-- Partitioning by month on created_at allows:
--   - Instant partition drop for data retention (no table-lock DELETE).
--   - Query pruning: scans only touch partitions matching the date filter.
--   - Per-tenant isolation via RLS policies applied uniformly across all partitions.
--
-- NOTE: This migration is additive — it creates new tables alongside any
-- existing in-process or file-backed drift event storage.  Switch the
-- driftevents-pg.ts repository to target drift_events once deployed.
--
-- Run with: psql $DATABASE_URL -f drizzle/0003_drift_events_partition.sql
-- Or via Drizzle migrate if the migration runner supports arbitrary SQL.

-- ---------------------------------------------------------------------------
-- Parent partitioned table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drift_events (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,  -- Clerk org / saas_tenants.id
  host_id      text        NOT NULL,
  category     text        NOT NULL,
  severity     text        NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  lifecycle    text        NOT NULL DEFAULT 'new'
                            CHECK (lifecycle IN ('new','triaged','accepted_risk','remediated','verified')),
  title        text        NOT NULL,
  rationale    text        NOT NULL DEFAULT '',
  evidence_summary text   NOT NULL DEFAULT '',
  suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance   jsonb,
  detected_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- primary key must include the partition key
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- ---------------------------------------------------------------------------
-- Bootstrap partitions: 12 months from 2026-01 to 2026-12
-- (Run the helper function below monthly via pg_cron or an ops script.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drift_events_2026_01
  PARTITION OF drift_events FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS drift_events_2026_02
  PARTITION OF drift_events FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS drift_events_2026_03
  PARTITION OF drift_events FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS drift_events_2026_04
  PARTITION OF drift_events FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS drift_events_2026_05
  PARTITION OF drift_events FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS drift_events_2026_06
  PARTITION OF drift_events FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS drift_events_2026_07
  PARTITION OF drift_events FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS drift_events_2026_08
  PARTITION OF drift_events FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS drift_events_2026_09
  PARTITION OF drift_events FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS drift_events_2026_10
  PARTITION OF drift_events FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS drift_events_2026_11
  PARTITION OF drift_events FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS drift_events_2026_12
  PARTITION OF drift_events FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Default partition catches any overflow until the next named partition is created
CREATE TABLE IF NOT EXISTS drift_events_default
  PARTITION OF drift_events DEFAULT;

-- ---------------------------------------------------------------------------
-- Indexes (created on the parent; Postgres propagates to each partition)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS drift_events_tenant_created
  ON drift_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS drift_events_host_created
  ON drift_events (host_id, created_at DESC);

CREATE INDEX IF NOT EXISTS drift_events_lifecycle
  ON drift_events (tenant_id, lifecycle, created_at DESC)
  WHERE lifecycle IN ('new', 'triaged');

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE drift_events ENABLE ROW LEVEL SECURITY;

-- Application role may only see rows for the current tenant.
-- Set app.current_tenant before every query:
--   SET LOCAL app.current_tenant = '<tenant_uuid>';
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'drift_events' AND policyname = 'drift_events_tenant_isolation'
  ) THEN
    CREATE POLICY drift_events_tenant_isolation ON drift_events
      USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Helper: create the next calendar-month partition
-- Call this from a cron job on the 25th of each month.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_next_drift_events_partition()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  next_start date := date_trunc('month', now()) + interval '1 month';
  next_end   date := next_start + interval '1 month';
  table_name text := 'drift_events_' || to_char(next_start, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF drift_events FOR VALUES FROM (%L) TO (%L)',
    table_name, next_start, next_end
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Data retention helper: drop a partition older than the retention window.
-- Example: SELECT drop_drift_events_partition('2025-09-01');
-- This is instant (metadata-only) — no DELETE scan, no table lock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION drop_drift_events_partition(partition_month date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  table_name text := 'drift_events_' || to_char(partition_month, 'YYYY_MM');
BEGIN
  EXECUTE format('DROP TABLE IF EXISTS %I', table_name);
END;
$$;
