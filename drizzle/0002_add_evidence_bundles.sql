-- Migration: per-tenant evidence bundle registry
-- Adds saas_evidence_bundles — stores generated audit packages with SHA256 integrity.
-- RLS pattern matches 0001_add_collector_hosts.sql

CREATE TABLE IF NOT EXISTS "saas_evidence_bundles" (
  "id"           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenant_id"    uuid         NOT NULL REFERENCES "saas_tenants"("id") ON DELETE CASCADE,
  "title"        text         NOT NULL,
  "scope"        text         NOT NULL DEFAULT 'all',
  "sha256"       text         NOT NULL,
  "payload"      jsonb        NOT NULL,
  "generated_by" text,
  "created_at"   timestamptz  NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX "saas_evidence_bundles_tenant_idx" ON "saas_evidence_bundles" ("tenant_id", "created_at" DESC);
--> statement-breakpoint

-- Row-level security (same GUC pattern as 0001_add_collector_hosts.sql)
ALTER TABLE "saas_evidence_bundles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "saas_evidence_bundles_select" ON "saas_evidence_bundles"
  FOR SELECT USING (
    current_setting('app.bypass_rls', TRUE) = '1'
    OR "tenant_id" = current_setting('app.tenant_id', TRUE)::uuid
  );
--> statement-breakpoint

CREATE POLICY "saas_evidence_bundles_insert" ON "saas_evidence_bundles"
  FOR INSERT WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = '1'
    OR "tenant_id" = current_setting('app.tenant_id', TRUE)::uuid
  );
--> statement-breakpoint

CREATE POLICY "saas_evidence_bundles_delete" ON "saas_evidence_bundles"
  FOR DELETE USING (
    current_setting('app.bypass_rls', TRUE) = '1'
    OR "tenant_id" = current_setting('app.tenant_id', TRUE)::uuid
  );
