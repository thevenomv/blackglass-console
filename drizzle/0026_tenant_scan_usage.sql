-- Per-tenant monthly scan-cost counters for unit-economics visibility.
-- Each row is keyed by (tenant_id, period_start) where period_start is
-- truncated to the first day of the UTC month, giving a natural billing-period
-- summary without partitioning overhead.
--
-- scan_jobs  = number of POST /api/v1/scans jobs completed this month
-- host_scans = cumulative count of individual host scans (one job may scan N hosts)
--
-- Incremented atomically via INSERT … ON CONFLICT DO UPDATE in the scan worker.
-- Read by the operator dashboard / admin API for unit-economics reporting.

CREATE TABLE IF NOT EXISTS "saas_scan_usage" (
  "tenant_id"    uuid        NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  "period_start" timestamptz NOT NULL,
  "scan_jobs"    integer     NOT NULL DEFAULT 0,
  "host_scans"   integer     NOT NULL DEFAULT 0,
  "updated_at"   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("tenant_id", "period_start")
);

CREATE INDEX IF NOT EXISTS "saas_scan_usage_tenant_period_idx"
  ON "saas_scan_usage" ("tenant_id", "period_start" DESC);
