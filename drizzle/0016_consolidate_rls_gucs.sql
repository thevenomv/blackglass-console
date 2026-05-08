-- Migration: consolidate RLS GUC names so withTenantRls / withBypassRls
-- actually bind the policies on every tenant-scoped table.
--
-- Background
-- ----------
-- Three different GUC names accumulated across earlier migrations:
--
--   app.tenant_id          ← what withTenantRls actually sets
--   app.bypass_rls         ← what withBypassRls actually sets
--   app.current_tenant     ← used by 0003_drift_events_partition,
--                             0004_tenant_credentials  (never set in code!)
--   app.current_tenant_id  ← used by 0008/0009/0010/0011/0012
--                             (never set in code either)
--
-- Net effect: drift_events RLS was effectively disabled at the DB
-- layer in production; isolation there relied on application-level
-- WHERE clauses + the per-row tenant_id column. Other tables
-- (api_keys, policies, drift_mutes, remediations, retention,
-- exports, cis_mappings, tenant_notifications) were *also* relying
-- on a GUC the application never sets — they worked only because
-- the production app role was the table owner (RLS skipped) or had
-- BYPASSRLS.
--
-- This migration aligns every RLS policy onto the single canonical
-- pair (`app.tenant_id`, `app.bypass_rls`) so the guarantees hold
-- regardless of role privileges. The migration is idempotent and
-- does NOT drop the old policies in case some operator's tooling
-- depends on them; instead it CREATEs new policies with a `_v2`
-- suffix and drops the originals only when they are known-shipped
-- BLACKGLASS policies (matched by exact policyname + tablename).

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
-- drift_events — was using app.current_tenant with NO bypass clause.
-- ---------------------------------------------------------------------------

ALTER TABLE drift_events ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.drop_policy_if_exists('drift_events', 'drift_events_tenant_isolation');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'drift_events' AND policyname = 'drift_events_tenant_isolation_v2'
  ) THEN
    CREATE POLICY drift_events_tenant_isolation_v2 ON drift_events
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
-- tenant_credentials — was using app.current_tenant with NO bypass clause.
-- ---------------------------------------------------------------------------

ALTER TABLE tenant_credentials ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.drop_policy_if_exists('tenant_credentials', 'tenant_credentials_isolation');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_credentials' AND policyname = 'tenant_credentials_isolation_v2'
  ) THEN
    CREATE POLICY tenant_credentials_isolation_v2 ON tenant_credentials
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
-- The `app.current_tenant_id` family of policies. Each table's
-- existing policy is replaced by an aligned _v2.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rec RECORD;
  v_table text;
  v_old_policy text;
  v_new_policy text;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('saas_api_keys',                'saas_api_keys_isolation',                'saas_api_keys_isolation_v2'),
      ('saas_policy_versions',         'saas_policy_versions_isolation',         'saas_policy_versions_isolation_v2'),
      ('saas_drift_mutes',             'saas_drift_mutes_isolation',             'saas_drift_mutes_isolation_v2'),
      ('saas_tenant_notifications',    'saas_tenant_notifications_isolation',    'saas_tenant_notifications_isolation_v2'),
      ('saas_remediation_recommendations', 'saas_remediation_recommendations_isolation', 'saas_remediation_recommendations_isolation_v2'),
      ('saas_retention_policies',      'saas_retention_policies_tenant_isolation', 'saas_retention_policies_isolation_v2'),
      ('saas_data_exports',            'saas_data_exports_tenant_isolation',     'saas_data_exports_isolation_v2'),
      ('saas_cis_mappings',            'saas_cis_mappings_tenant_isolation',     'saas_cis_mappings_isolation_v2')
    ) AS t(tbl, old_policy, new_policy)
  LOOP
    v_table := rec.tbl;
    v_old_policy := rec.old_policy;
    v_new_policy := rec.new_policy;

    -- Skip tables that aren't deployed yet (defensive — running this
    -- against a partially-migrated DB shouldn't error out).
    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE relname = v_table AND relkind = 'r'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table);
    PERFORM pg_temp.drop_policy_if_exists(v_table, v_old_policy);

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

-- ---------------------------------------------------------------------------
-- Optional belt-and-braces: FORCE RLS on the most sensitive tenant
-- tables. Without this, Postgres skips RLS for the table OWNER (the
-- migration role). Production deployments that run the app under a
-- non-owner role get RLS unconditionally; deployments where the app
-- IS the owner historically didn't.
--
-- We FORCE on the highest-impact tables only — drift_events,
-- tenant_credentials, saas_api_keys, saas_remediation_recommendations,
-- saas_data_exports — because these contain or generate the most
-- sensitive material (creds, audit chains, exports).
--
-- IMPORTANT: this is conditional on a deployment opt-in via the
-- `BLACKGLASS_FORCE_RLS=1` env var captured at apply time, because
-- forcing RLS on a deployment whose app role is also the table
-- owner AND whose `withBypassRls` hasn't been fixed (see migration
-- comment) would cause every bypass-mode write to fail with the
-- empty-string-uuid cast error. The migration is idempotent so an
-- operator can re-run it after deploying the matching app code:
--
--   BLACKGLASS_FORCE_RLS=1 npm run db:migrate
--
-- Without the flag the FORCE is a no-op and the cluster behaves
-- exactly as before — just with the policy GUCs aligned.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_force_rls text := current_setting('blackglass.force_rls', true);
BEGIN
  IF v_force_rls = '1' THEN
    -- The setting is itself opt-in and short-lived — see runbook.
    EXECUTE 'ALTER TABLE drift_events FORCE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE tenant_credentials FORCE ROW LEVEL SECURITY';
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'saas_api_keys' AND relkind = 'r') THEN
      EXECUTE 'ALTER TABLE saas_api_keys FORCE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'saas_remediation_recommendations' AND relkind = 'r') THEN
      EXECUTE 'ALTER TABLE saas_remediation_recommendations FORCE ROW LEVEL SECURITY';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'saas_data_exports' AND relkind = 'r') THEN
      EXECUTE 'ALTER TABLE saas_data_exports FORCE ROW LEVEL SECURITY';
    END IF;
  END IF;
END $$;
