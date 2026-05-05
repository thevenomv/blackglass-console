-- Migration: per-tenant SSH collector host registry
-- Adds saas_collector_hosts table with RLS matching the pattern in 007_saas_rls.sql

CREATE TABLE "saas_collector_hosts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "saas_tenants"("id") ON DELETE cascade,
  "hostname" text NOT NULL,
  "label" text,
  "ssh_user" text NOT NULL DEFAULT 'blackglass',
  "ssh_port" integer NOT NULL DEFAULT 22,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "saas_collector_hosts_tenant_hostname_uq"
  ON "saas_collector_hosts" USING btree ("tenant_id", "hostname");
--> statement-breakpoint

-- Row-level security (same GUC pattern as docs/migrations/007_saas_rls.sql)
ALTER TABLE saas_collector_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_collector_hosts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saas_collector_hosts_select ON saas_collector_hosts;
CREATE POLICY saas_collector_hosts_select ON saas_collector_hosts FOR SELECT
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_collector_hosts_insert ON saas_collector_hosts;
CREATE POLICY saas_collector_hosts_insert ON saas_collector_hosts FOR INSERT
  WITH CHECK (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_collector_hosts_update ON saas_collector_hosts;
CREATE POLICY saas_collector_hosts_update ON saas_collector_hosts FOR UPDATE
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_collector_hosts_delete ON saas_collector_hosts;
CREATE POLICY saas_collector_hosts_delete ON saas_collector_hosts FOR DELETE
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );
