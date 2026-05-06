-- Migration: add credential_id FK to saas_collector_hosts
--
-- Allows individual collector hosts to use a per-tenant SSH key from
-- `tenant_credentials` instead of the global env-level SSH_PRIVATE_KEY.
-- Used when SECRET_PROVIDER=db.  NULL means fall back to the global credential.
--
-- Run with: doppler run -- node scripts/ops/_apply-partition-migration.mjs
-- Or:       psql $DATABASE_URL -f drizzle/0005_collector_hosts_credential_id.sql

ALTER TABLE saas_collector_hosts
  ADD COLUMN IF NOT EXISTS credential_id uuid
    REFERENCES tenant_credentials(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS saas_collector_hosts_credential_id_idx
  ON saas_collector_hosts (credential_id)
  WHERE credential_id IS NOT NULL;
