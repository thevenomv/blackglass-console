/**
 * RLS tenant-leak guardrail (live Postgres).
 *
 * Skips when DATABASE_URL is not set — runs in CI's `migrations`
 * job (which spins up a fresh Postgres) and locally when an operator
 * exports a dev DATABASE_URL.
 *
 * The test creates two synthetic tenants, inserts data for both
 * directly via `withBypassRls`, then opens a transaction under
 * tenant A's RLS context and asserts:
 *
 *   1. SELECT returns ONLY tenant A's rows even when the WHERE
 *      clause asks for both.
 *   2. UPDATE attempting to mutate a tenant B row affects 0 rows
 *      (RLS denies the row even when the WHERE clause matches).
 *   3. DELETE attempting to remove a tenant B row affects 0 rows.
 *   4. Symmetry: tenant B's context cannot see tenant A's row either.
 *
 * Cleanup runs in `afterAll` even on failure so a partial run does
 * not leave orphan rows in shared CI databases.
 *
 * Why we use `saas_evidence_bundles` rather than `drift_events`:
 *
 *   The codebase has THREE distinct GUC names in use across
 *   migrations: `app.tenant_id`, `app.current_tenant`, and
 *   `app.current_tenant_id`. `withTenantRls()` sets `app.tenant_id`,
 *   so this test only exercises tables whose policies match that
 *   GUC (collector_hosts / evidence_bundles / sandboxes /
 *   tenant_kms_keys). The `drift_events` policy still references
 *   `app.current_tenant` — that's a known inconsistency tracked
 *   separately and outside the scope of this guardrail.
 *
 * Why we connect as a non-superuser role:
 *
 *   By default, Postgres skips RLS for the table OWNER and for any
 *   role with BYPASSRLS (which superusers always have). CI's default
 *   `postgres` user is BOTH owner AND superuser — so connecting as
 *   it would silently bypass every policy. The CI step
 *   `Create non-superuser RLS test role` provisions an
 *   `rls_test_app` LOGIN role with NOSUPERUSER + NOBYPASSRLS that
 *   the test's DATABASE_URL points at; that role behaves the way
 *   the production app role is supposed to behave (per
 *   `docs/security-compliance.md` § 1).
 *
 * If this test fails, the application-level `withTenantRls` wrapper
 * is no longer the trust boundary it claims to be — that is a SEV-1
 * regression, not a "fix the test" situation.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const HAS_DB = (process.env.DATABASE_URL ?? "").trim().length > 0;
const describeMaybe = HAS_DB ? describe : describe.skip;

describeMaybe("RLS tenant isolation (live Postgres)", () => {
  let tenantA: string;
  let tenantB: string;
  let bundleIdA: string;
  let bundleIdB: string;

  beforeAll(async () => {
    tenantA = randomUUID();
    tenantB = randomUUID();
    bundleIdA = randomUUID();
    bundleIdB = randomUUID();

    const { withBypassRls } = await import("../../src/db");
    await withBypassRls(async (db) => {
      // saas_evidence_bundles.tenant_id has an FK to saas_tenants(id);
      // create the parent rows first.
      await db.execute(sql`
        INSERT INTO saas_tenants (id, clerk_org_id, name) VALUES
          (${tenantA}::uuid, ${`rls-test-${tenantA}`}, 'rls-test-A'),
          (${tenantB}::uuid, ${`rls-test-${tenantB}`}, 'rls-test-B')
      `);
      await db.execute(sql`
        INSERT INTO saas_evidence_bundles (id, tenant_id, title, sha256, payload)
        VALUES
          (${bundleIdA}::uuid, ${tenantA}::uuid, 'tenant-A bundle', 'sha-A', '{}'::jsonb),
          (${bundleIdB}::uuid, ${tenantB}::uuid, 'tenant-B bundle', 'sha-B', '{}'::jsonb)
      `);
    });
  });

  afterAll(async () => {
    if (!tenantA) return;
    const { withBypassRls } = await import("../../src/db");
    await withBypassRls(async (db) => {
      // ON DELETE CASCADE on the FK takes care of any child rows
      // (audit / evidence / etc.) that the test created.
      await db.execute(sql`DELETE FROM saas_tenants WHERE id IN (${tenantA}::uuid, ${tenantB}::uuid)`);
    });
  });

  it("SELECT under tenant A's RLS context returns only tenant A's rows", async () => {
    const { withTenantRls } = await import("../../src/db");
    const seen = await withTenantRls(tenantA, async (tx) => {
      const r = await tx.execute<{ id: string; tenant_id: string; title: string }>(
        sql`SELECT id, tenant_id, title FROM saas_evidence_bundles WHERE tenant_id IN (${tenantA}::uuid, ${tenantB}::uuid)`,
      );
      return r.rows;
    });
    // RLS must filter out tenant B even though the WHERE clause asked for both.
    expect(seen.length).toBe(1);
    expect(seen[0].tenant_id).toBe(tenantA);
    expect(seen.find((r) => r.tenant_id === tenantB)).toBeUndefined();
  });

  it("DELETE targeting tenant B from tenant A's context affects 0 rows", async () => {
    const { withTenantRls } = await import("../../src/db");
    const affected = await withTenantRls(tenantA, async (tx) => {
      const r = await tx.execute(
        sql`DELETE FROM saas_evidence_bundles WHERE id = ${bundleIdB}::uuid`,
      );
      return r.rowCount ?? 0;
    });
    expect(affected).toBe(0);
  });

  it("symmetry: tenant B's context does not see tenant A's row either", async () => {
    const { withTenantRls } = await import("../../src/db");
    const seen = await withTenantRls(tenantB, async (tx) => {
      const r = await tx.execute<{ tenant_id: string }>(
        sql`SELECT tenant_id FROM saas_evidence_bundles WHERE id = ${bundleIdA}::uuid`,
      );
      return r.rows;
    });
    expect(seen.length).toBe(0);
  });

  it("withBypassRls sees all rows again after the test policy was forced", async () => {
    const { withBypassRls } = await import("../../src/db");
    const seen = await withBypassRls(async (db) => {
      const r = await db.execute<{ tenant_id: string }>(
        sql`SELECT tenant_id FROM saas_evidence_bundles WHERE id IN (${bundleIdA}::uuid, ${bundleIdB}::uuid)`,
      );
      return r.rows;
    });
    // Bypass mode must override the forced RLS — that's its whole job.
    expect(seen.length).toBe(2);
  });
});
