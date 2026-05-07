-- Migration 0009: per-tenant notification routing
-- One row per tenant; null columns fall back to env-var defaults.

CREATE TABLE IF NOT EXISTS saas_tenant_notifications (
  tenant_id          UUID PRIMARY KEY REFERENCES saas_tenants(id) ON DELETE CASCADE,
  alert_email_to     TEXT,
  webhook_urls       TEXT,
  slack_webhook_url  TEXT,
  pd_routing_key     TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE saas_tenant_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY saas_tenant_notifications_isolation ON saas_tenant_notifications
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = '1'
  );
