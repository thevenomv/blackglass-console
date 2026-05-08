-- Migration 0014: per-tenant KMS / BYOK groundwork.
--
-- Some enterprise customers want their own KMS root key (in their own
-- AWS account / Vault cluster) used to wrap data-encryption keys for
-- their tenant. This is the "Bring Your Own Key" data model — one row
-- per tenant, optional. When no row exists, encryption falls back to
-- the global KMS_PROVIDER configured at the deployment level (see
-- src/lib/server/secrets/envelope.ts).
--
-- This migration ships the schema only — `encryptKey()` and
-- `decryptKey()` remain global until BYOK_ENABLED=true at runtime AND a
-- row exists for the tenant. That keeps the rollout safe: the table can
-- exist on every deployment without changing any encryption behaviour.
--
-- Notes:
--   - `provider_secret_encrypted` holds an envelope-encrypted blob
--     containing whatever credentials the provider needs (e.g. a Vault
--     token, an AWS role-assume payload). It is wrapped by the *global*
--     KMS so we never store provider secrets in plaintext, even for
--     tenants who supply their own KEK reference.
--   - `last_verified_at` lets the operator UI show whether the customer
--     KEK is still reachable (we periodically run a no-op encrypt/decrypt
--     against a known plaintext to confirm).
--
-- Apply with: node scripts/ops/apply-migrations.mjs

CREATE TABLE IF NOT EXISTS saas_tenant_kms_keys (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id                   uuid        NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  -- Which KMS the customer wants to use for THIS tenant. Must be one of
  -- the providers supported by envelope.ts: 'awskms' | 'vault'. We do
  -- not allow 'local' — that is a developer convenience only.
  provider                    text        NOT NULL,
  -- Opaque KMS key reference. For awskms this is the KMS Key ARN/ID; for
  -- vault this is the Transit key name.
  key_ref                     text        NOT NULL,
  -- Envelope-encrypted (using the GLOBAL KMS) blob of provider creds.
  -- May be NULL when the deployment can authenticate to the customer
  -- KMS via ambient credentials (IAM instance profile, Workload
  -- Identity, …) rather than per-tenant secrets.
  provider_secret_encrypted   text,
  enabled                     boolean     NOT NULL DEFAULT true,
  last_verified_at            timestamptz,
  last_verify_error           text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_tenant_kms_keys_provider_chk
    CHECK (provider IN ('awskms', 'vault'))
);

CREATE UNIQUE INDEX IF NOT EXISTS saas_tenant_kms_keys_tenant_uq
  ON saas_tenant_kms_keys (tenant_id);

ALTER TABLE saas_tenant_kms_keys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'saas_tenant_kms_keys' AND policyname = 'saas_tenant_kms_keys_isolation'
  ) THEN
    CREATE POLICY saas_tenant_kms_keys_isolation ON saas_tenant_kms_keys
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;
