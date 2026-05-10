-- Charon Phase 2 — cleanup requests (HITL; executor is stub until live DO deletes).

CREATE TABLE IF NOT EXISTS "janitor_cleanup_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "saas_tenants"("id") ON DELETE CASCADE,
  "finding_id" uuid NOT NULL REFERENCES "janitor_findings"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'pending' NOT NULL,
  "approved_by_user_id" text,
  "approved_at" timestamptz,
  "executed_at" timestamptz,
  "mode" text DEFAULT 'dry_run' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "janitor_cleanup_requests_tenant_idx" ON "janitor_cleanup_requests" ("tenant_id");
CREATE INDEX IF NOT EXISTS "janitor_cleanup_requests_status_idx" ON "janitor_cleanup_requests" ("tenant_id", "status");

ALTER TABLE "janitor_cleanup_requests" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'janitor_cleanup_requests' AND policyname = 'janitor_cleanup_requests_isolation_v2'
  ) THEN
    CREATE POLICY janitor_cleanup_requests_isolation_v2 ON janitor_cleanup_requests
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
