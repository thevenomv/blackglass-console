-- Charon: dismiss/snooze by resource key so suppressions survive full rescan.

CREATE TABLE IF NOT EXISTS "janitor_resource_suppressions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "saas_tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "janitor_accounts"("id") ON DELETE CASCADE,
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "kind" text NOT NULL,
  "snooze_until" timestamp with time zone,
  "note" text,
  "created_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "janitor_resource_suppressions_account_res_uq"
  ON "janitor_resource_suppressions" ("account_id", "resource_type", "resource_id");

CREATE INDEX IF NOT EXISTS "janitor_resource_suppressions_tenant_idx"
  ON "janitor_resource_suppressions" ("tenant_id");

ALTER TABLE "janitor_resource_suppressions" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'janitor_resource_suppressions' AND policyname = 'janitor_resource_suppressions_isolation_v2'
  ) THEN
    CREATE POLICY janitor_resource_suppressions_isolation_v2 ON janitor_resource_suppressions
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
