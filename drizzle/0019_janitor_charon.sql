-- BLACKGLASS Charon — linked cloud accounts + idle findings (read-only scan MVP).

CREATE TABLE IF NOT EXISTS "janitor_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "saas_tenants"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "account_name" text NOT NULL,
  "encrypted_api_key" text NOT NULL,
  "scopes_verified" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_scan_at" timestamptz,
  "scan_schedule" text DEFAULT 'manual' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "janitor_accounts_tenant_name_uq"
  ON "janitor_accounts" ("tenant_id", "account_name");

CREATE INDEX IF NOT EXISTS "janitor_accounts_tenant_idx" ON "janitor_accounts" ("tenant_id");

CREATE TABLE IF NOT EXISTS "janitor_findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "saas_tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "janitor_accounts"("id") ON DELETE CASCADE,
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "resource_name" text NOT NULL,
  "idle_score" integer NOT NULL,
  "estimated_waste_monthly" numeric(12, 2) NOT NULL,
  "tags" jsonb,
  "metrics_meta" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "janitor_findings_account_resource_uq"
  ON "janitor_findings" ("account_id", "resource_type", "resource_id");

CREATE INDEX IF NOT EXISTS "janitor_findings_tenant_idx" ON "janitor_findings" ("tenant_id");
CREATE INDEX IF NOT EXISTS "janitor_findings_account_idx" ON "janitor_findings" ("account_id");

ALTER TABLE "janitor_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "janitor_findings" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'janitor_accounts' AND policyname = 'janitor_accounts_isolation_v2'
  ) THEN
    CREATE POLICY janitor_accounts_isolation_v2 ON janitor_accounts
      USING (
        current_setting('app.bypass_rls', TRUE) = '1'
        OR tenant_id = current_setting('app.tenant_id', TRUE)::uuid
      )
      WITH CHECK (
        current_setting('app.bypass_rls', TRUE) = '1'
        OR tenant_id = current_setting('app.tenant_id', TRUE)::uuid
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'janitor_findings' AND policyname = 'janitor_findings_isolation_v2'
  ) THEN
    CREATE POLICY janitor_findings_isolation_v2 ON janitor_findings
      USING (
        current_setting('app.bypass_rls', TRUE) = '1'
        OR tenant_id = current_setting('app.tenant_id', TRUE)::uuid
      )
      WITH CHECK (
        current_setting('app.bypass_rls', TRUE) = '1'
        OR tenant_id = current_setting('app.tenant_id', TRUE)::uuid
      );
  END IF;
END $$;
