-- Migration 0015: per-tenant drift-digest cadence override.
--
-- Adds `drift_digest_cadence` to `saas_tenant_notifications`. Null means
-- "use the deployment-wide default" (DRIFT_DIGEST_INTERVAL env var) — so
-- existing rows continue to behave exactly as before. When a value is
-- present it overrides the deployment cadence for that tenant.
--
-- Allowed values: 'off' | 'daily' | 'weekly'. Anything else gets
-- rejected by the API + service layer; the SQL CHECK is a backstop.

ALTER TABLE saas_tenant_notifications
  ADD COLUMN IF NOT EXISTS drift_digest_cadence TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'saas_tenant_notifications_digest_cadence_chk'
  ) THEN
    ALTER TABLE saas_tenant_notifications
      ADD CONSTRAINT saas_tenant_notifications_digest_cadence_chk
      CHECK (drift_digest_cadence IS NULL OR drift_digest_cadence IN ('off', 'daily', 'weekly'));
  END IF;
END $$;
