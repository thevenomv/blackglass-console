-- Host tombstones — short-lived "do not re-bootstrap" markers written when an
-- operator deletes a host from the dashboard. Without these, a still-running
-- push-agent on the deleted host would re-ingest within ~5 minutes and the
-- /api/v1/ingest/agent route would happily bootstrap a fresh baseline,
-- making the deleted host reappear in the inventory. The agent ingest path
-- now consults this table and returns 410 Gone for tombstoned host_ids
-- until expires_at is reached (or the row is explicitly cleared by an
-- operator who wants to allow re-registration).
--
-- This is intentionally a small, focused table — no per-event audit, no
-- soft-delete semantics. The audit trail for the deletion itself lives in
-- saas_audit_events; the tombstone just prevents the resurrection bug.

CREATE TABLE IF NOT EXISTS saas_host_tombstones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL tenant_id is reserved for legacy / single-tenant deployments where
  -- the ingest path has no tenant context. RLS allows those rows only via
  -- bypass mode (the ingest route runs in bypass mode for the SaaS-less
  -- path).
  tenant_id uuid REFERENCES saas_tenants(id) ON DELETE CASCADE,
  host_id text NOT NULL,
  hostname text,
  deleted_by text,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  -- Default 24h; `HOST_TOMBSTONE_TTL_HOURS` env override is applied at
  -- insert time by the application, not here.
  expires_at timestamptz NOT NULL
);

-- Lookup is always (tenant_id, host_id) ORDER BY expires_at DESC LIMIT 1.
-- We index the trio so the planner can satisfy the hot path with a single
-- index probe; expired rows linger until the next maintenance sweep but
-- they're cheap (no jsonb, no large text).
CREATE INDEX IF NOT EXISTS saas_host_tombstones_lookup_idx
  ON saas_host_tombstones (tenant_id, host_id, expires_at DESC);

ALTER TABLE saas_host_tombstones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'saas_host_tombstones' AND policyname = 'saas_host_tombstones_isolation_v1'
  ) THEN
    CREATE POLICY saas_host_tombstones_isolation_v1 ON saas_host_tombstones
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
