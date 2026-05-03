-- Row-level security for multi-tenant SaaS tables (defense in depth).
-- **Apply only after deploying application code** that uses `withTenantRls` / `withBypassRls`
-- (`src/db/index.ts`). Otherwise tenant-scoped queries may return no rows.
-- App sessions set GUCs per transaction:
--   SELECT set_config('app.tenant_id', '<uuid>', true);
--   SELECT set_config('app.bypass_rls', '1', true);   -- trusted webhooks / maintenance only
-- See src/db/index.ts: withTenantRls / withBypassRls.
--
-- saas_webhook_idempotency: no RLS (no tenant_id; cross-tenant dedupe).
-- Operational scripts that DELETE across tenants must SET bypass or use a BYPASSRLS role.

ALTER TABLE saas_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE saas_tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_tenant_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE saas_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_audit_events FORCE ROW LEVEL SECURITY;

ALTER TABLE saas_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_security_events FORCE ROW LEVEL SECURITY;

-- --- saas_tenants ------------------------------------------------------------

DROP POLICY IF EXISTS saas_tenants_select ON saas_tenants;
CREATE POLICY saas_tenants_select ON saas_tenants FOR SELECT
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_tenants_insert ON saas_tenants;
CREATE POLICY saas_tenants_insert ON saas_tenants FOR INSERT
  WITH CHECK (current_setting('app.bypass_rls', true) = '1');

DROP POLICY IF EXISTS saas_tenants_update ON saas_tenants;
CREATE POLICY saas_tenants_update ON saas_tenants FOR UPDATE
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = '1'
    OR id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_tenants_delete ON saas_tenants;
CREATE POLICY saas_tenants_delete ON saas_tenants FOR DELETE
  USING (current_setting('app.bypass_rls', true) = '1');

-- --- saas_subscriptions -------------------------------------------------------

DROP POLICY IF EXISTS saas_subscriptions_select ON saas_subscriptions;
CREATE POLICY saas_subscriptions_select ON saas_subscriptions FOR SELECT
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_subscriptions_insert ON saas_subscriptions;
CREATE POLICY saas_subscriptions_insert ON saas_subscriptions FOR INSERT
  WITH CHECK (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_subscriptions_update ON saas_subscriptions;
CREATE POLICY saas_subscriptions_update ON saas_subscriptions FOR UPDATE
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_subscriptions_delete ON saas_subscriptions;
CREATE POLICY saas_subscriptions_delete ON saas_subscriptions FOR DELETE
  USING (current_setting('app.bypass_rls', true) = '1');

-- --- saas_tenant_memberships --------------------------------------------------

DROP POLICY IF EXISTS saas_tenant_memberships_select ON saas_tenant_memberships;
CREATE POLICY saas_tenant_memberships_select ON saas_tenant_memberships FOR SELECT
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_tenant_memberships_insert ON saas_tenant_memberships;
CREATE POLICY saas_tenant_memberships_insert ON saas_tenant_memberships FOR INSERT
  WITH CHECK (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_tenant_memberships_update ON saas_tenant_memberships;
CREATE POLICY saas_tenant_memberships_update ON saas_tenant_memberships FOR UPDATE
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_tenant_memberships_delete ON saas_tenant_memberships;
CREATE POLICY saas_tenant_memberships_delete ON saas_tenant_memberships FOR DELETE
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

-- --- saas_audit_events --------------------------------------------------------

DROP POLICY IF EXISTS saas_audit_events_select ON saas_audit_events;
CREATE POLICY saas_audit_events_select ON saas_audit_events FOR SELECT
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_audit_events_insert ON saas_audit_events;
CREATE POLICY saas_audit_events_insert ON saas_audit_events FOR INSERT
  WITH CHECK (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_audit_events_delete ON saas_audit_events;
CREATE POLICY saas_audit_events_delete ON saas_audit_events FOR DELETE
  USING (current_setting('app.bypass_rls', true) = '1');

-- --- saas_security_events -----------------------------------------------------

DROP POLICY IF EXISTS saas_security_events_select ON saas_security_events;
CREATE POLICY saas_security_events_select ON saas_security_events FOR SELECT
  USING (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_security_events_insert ON saas_security_events;
CREATE POLICY saas_security_events_insert ON saas_security_events FOR INSERT
  WITH CHECK (
    current_setting('app.bypass_rls', true) = '1'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS saas_security_events_delete ON saas_security_events;
CREATE POLICY saas_security_events_delete ON saas_security_events FOR DELETE
  USING (current_setting('app.bypass_rls', true) = '1');
