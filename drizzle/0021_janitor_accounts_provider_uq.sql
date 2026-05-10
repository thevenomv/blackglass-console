-- Allow the same display name per tenant across providers (e.g. "Production" on DO and AWS).

DROP INDEX IF EXISTS "janitor_accounts_tenant_name_uq";

CREATE UNIQUE INDEX IF NOT EXISTS "janitor_accounts_tenant_name_provider_uq"
  ON "janitor_accounts" ("tenant_id", "account_name", "provider");
