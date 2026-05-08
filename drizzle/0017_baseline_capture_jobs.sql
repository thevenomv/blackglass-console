-- Baseline capture runs longer than Cloudflare's origin timeout when fleets are
-- large or SSH is slow. Jobs are persisted so POST can return 202 immediately
-- and the UI polls for completion while work continues via Next.js `after()`.

CREATE TABLE IF NOT EXISTS saas_baseline_capture_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES saas_tenants(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  request_id text,
  result jsonb,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS saas_baseline_capture_jobs_tenant_created_idx
  ON saas_baseline_capture_jobs (tenant_id, created_at DESC);

ALTER TABLE saas_baseline_capture_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'saas_baseline_capture_jobs' AND policyname = 'saas_baseline_capture_jobs_isolation_v2'
  ) THEN
    CREATE POLICY saas_baseline_capture_jobs_isolation_v2 ON saas_baseline_capture_jobs
      USING (
        current_setting('app.bypass_rls', TRUE) = '1'
        OR (
          tenant_id IS NOT NULL
          AND tenant_id = current_setting('app.tenant_id', TRUE)::uuid
        )
      )
      WITH CHECK (
        current_setting('app.bypass_rls', TRUE) = '1'
        OR (
          tenant_id IS NOT NULL
          AND tenant_id = current_setting('app.tenant_id', TRUE)::uuid
        )
      );
  END IF;
END $$;
