-- Migration: per-tenant SSH credential store
--
-- Stores SSH private keys per tenant, envelope-encrypted at rest via envelope.ts.
-- `encrypted_key` holds either a plain PEM (legacy) or a JSON EncryptedKey blob:
--   { ciphertext, iv, authTag, wrappedDek, kmsProvider }
-- produced by encryptKey() in src/lib/server/secrets/envelope.ts.
--
-- Use maybeDecryptPem(row.encrypted_key) to transparently obtain the raw PEM buffer.
--
-- Run with: psql $DATABASE_URL -f drizzle/0004_tenant_credentials.sql
-- Or via:   doppler run -- npx drizzle-kit migrate

CREATE TABLE IF NOT EXISTS tenant_credentials (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid        NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  label         text        NOT NULL,
  -- Plain PEM or JSON envelope-encrypted blob. Never store plaintext in application logs.
  encrypted_key text        NOT NULL,
  algorithm     text        NOT NULL DEFAULT 'ed25519',
  comment       text,
  -- SHA-256 fingerprint of the PUBLIC key for display (never the private material).
  fingerprint   text,
  rotated_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_credentials_tenant_label_uq
  ON tenant_credentials (tenant_id, label);

CREATE INDEX IF NOT EXISTS tenant_credentials_tenant_idx
  ON tenant_credentials (tenant_id);

-- Row-Level Security: tenants may only read their own credentials.
ALTER TABLE tenant_credentials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_credentials' AND policyname = 'tenant_credentials_isolation'
  ) THEN
    CREATE POLICY tenant_credentials_isolation ON tenant_credentials
      USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
  END IF;
END $$;
