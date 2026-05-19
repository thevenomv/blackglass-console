-- Migration 0027: Fix RLS GUC mismatches, add missing RLS, and fix enum.
--
-- Tables / issues addressed:
--   DB-01: saas_remediations        — policy used app.current_tenant_id (never set)
--   DB-02: saas_host_policies       — policy used app.current_tenant_id (never set)
--   DB-03: saas_sandboxes           — bypass_rls policy checked = 'on'; app sets '1'
--   DB-04: saas_scan_usage          — had no RLS at all
--   DB-05: saas_audit_events, saas_security_events,
--           saas_subscriptions, saas_tenant_memberships — never had RLS
--   DB-08: subscription_status enum  — 'past_due' value missing from DB type
--
-- Structure
-- ---------
-- The ALTER TYPE … ADD VALUE statement appears BEFORE the @pre-tx-end marker
-- so that apply-migrations.mjs can execute it outside the transaction block.
-- On PostgreSQL < 12 ALTER TYPE ADD VALUE cannot run inside a transaction;
-- on PostgreSQL ≥ 12 this ordering is purely defensive — behaviour is identical.
--
-- Everything after the @pre-tx-end marker runs inside a single transaction.

-- ── Pre-transaction: enum value ────────────────────────────────────────────

ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'past_due';

-- @pre-tx-end

-- ── Everything below runs inside a single transaction. ─────────────────────

-- ---------------------------------------------------------------------------
-- Helper: drop a policy if it exists, no-op otherwise.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.drop_policy_if_exists(
  p_table text, p_policy text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = p_table AND policyname = p_policy
  ) THEN
    EXECUTE format('DROP POLICY %I ON %I', p_policy, p_table);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- DB-01: saas_remediations
-- Was: tenant_id = current_setting('app.current_tenant_id', true)::uuid
-- Fix: align to canonical app.tenant_id + app.bypass_rls = '1'
-- ---------------------------------------------------------------------------

SELECT pg_temp.drop_policy_if_exists('saas_remediations', 'saas_remediations_tenant_isolation');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'saas_remediations'
      AND policyname = 'saas_remediations_tenant_isolation_v2'
  ) THEN
    CREATE POLICY saas_remediations_tenant_isolation_v2 ON saas_remediations
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

-- ---------------------------------------------------------------------------
-- DB-02: saas_host_policies
-- Was: tenant_id = current_setting('app.current_tenant_id', true)::uuid
-- Fix: align to canonical app.tenant_id + app.bypass_rls = '1'
-- ---------------------------------------------------------------------------

SELECT pg_temp.drop_policy_if_exists('saas_host_policies', 'saas_host_policies_tenant_isolation');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'saas_host_policies'
      AND policyname = 'saas_host_policies_tenant_isolation_v2'
  ) THEN
    CREATE POLICY saas_host_policies_tenant_isolation_v2 ON saas_host_policies
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

-- ---------------------------------------------------------------------------
-- DB-03: saas_sandboxes
-- Was: two separate policies — tenant_isolation (correct GUC, no bypass check)
--      and bypass_rls (checked = 'on'; app sets '1').
-- Fix: drop both, replace with a single canonical _v2 combining both checks.
-- ---------------------------------------------------------------------------

SELECT pg_temp.drop_policy_if_exists('saas_sandboxes', 'tenant_isolation');
SELECT pg_temp.drop_policy_if_exists('saas_sandboxes', 'bypass_rls');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'saas_sandboxes'
      AND policyname = 'saas_sandboxes_tenant_isolation_v2'
  ) THEN
    CREATE POLICY saas_sandboxes_tenant_isolation_v2 ON saas_sandboxes
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

-- ---------------------------------------------------------------------------
-- DB-04: saas_scan_usage
-- Had no RLS; reads and writes were unscoped by withTenantRls.
-- ---------------------------------------------------------------------------

ALTER TABLE saas_scan_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'saas_scan_usage'
      AND policyname = 'saas_scan_usage_tenant_isolation_v2'
  ) THEN
    CREATE POLICY saas_scan_usage_tenant_isolation_v2 ON saas_scan_usage
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

-- ---------------------------------------------------------------------------
-- DB-05: Core tenant tables from 0000_init_saas_schema.sql
-- saas_audit_events, saas_security_events, saas_subscriptions,
-- saas_tenant_memberships — none ever had RLS enabled.
--
-- saas_tenants is NOT scoped here: it is the root tenant lookup table,
-- accessed exclusively via withBypassRls (e.g. Clerk webhook provisioning).
-- saas_webhook_idempotency is global by design; no per-tenant scope needed.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rec RECORD;
  v_table text;
  v_new_policy text;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('saas_audit_events',        'saas_audit_events_tenant_isolation_v2'),
      ('saas_security_events',     'saas_security_events_tenant_isolation_v2'),
      ('saas_subscriptions',       'saas_subscriptions_tenant_isolation_v2'),
      ('saas_tenant_memberships',  'saas_tenant_memberships_tenant_isolation_v2')
    ) AS t(tbl, new_policy)
  LOOP
    v_table      := rec.tbl;
    v_new_policy := rec.new_policy;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE relname = v_table AND relkind = 'r'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = v_table AND policyname = v_new_policy
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I '
        'USING ('
        '  current_setting(''app.bypass_rls'', TRUE) = ''1'' '
        '  OR tenant_id = current_setting(''app.tenant_id'', TRUE)::uuid'
        ') '
        'WITH CHECK ('
        '  current_setting(''app.bypass_rls'', TRUE) = ''1'' '
        '  OR tenant_id = current_setting(''app.tenant_id'', TRUE)::uuid'
        ')',
        v_new_policy, v_table
      );
    END IF;
  END LOOP;
END $$;
