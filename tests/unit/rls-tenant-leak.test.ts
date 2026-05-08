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
 *   1. SELECT from `drift_events` returns ONLY tenant A's rows.
 *   2. SELECT from `saas_audit_events` returns ONLY tenant A's rows.
 *   3. UPDATE attempting to mutate a tenant B row affects 0 rows
 *      (RLS denies the row even when the WHERE clause matches).
 *   4. DELETE attempting to remove a tenant B row affects 0 rows.
 *
 * Cleanup runs in `afterAll` even on failure so a partial run does
 * not leave orphan rows in shared CI databases.
 *
 * If the test fails, the application-level `withTenantRls` wrapper
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
  let driftIdA: string;
  let driftIdB: string;
  let auditIdA: string;
  let auditIdB: string;

  beforeAll(async () => {
    tenantA = randomUUID();
    tenantB = randomUUID();
    driftIdA = randomUUID();
    driftIdB = randomUUID();
    auditIdA = randomUUID();
    auditIdB = randomUUID();

    const { withBypassRls } = await import("../../src/db");
    await withBypassRls(async (db) => {
      // saas_audit_events.tenant_id has an FK to saas_tenants(id);
      // create the parent rows before any audit insert.
      // clerk_org_id is UNIQUE so we use the test-run UUIDs as the
      // org id surrogates — they're guaranteed unique to this test.
      await db.execute(sql`
        INSERT INTO saas_tenants (id, clerk_org_id, name) VALUES
          (${tenantA}::uuid, ${`rls-test-${tenantA}`}, 'rls-test-A'),
          (${tenantB}::uuid, ${`rls-test-${tenantB}`}, 'rls-test-B')
      `);
      // drift_events is partitioned + RLS-enabled — perfect for the leak test.
      await db.execute(sql`
        INSERT INTO drift_events (id, tenant_id, host_id, category, severity, title)
        VALUES
          (${driftIdA}::uuid, ${tenantA}::uuid, 'host-A', 'packages', 'low',  'tenant-A drift'),
          (${driftIdB}::uuid, ${tenantB}::uuid, 'host-B', 'packages', 'low',  'tenant-B drift')
      `);
      // saas_audit_events also has RLS.
      await db.execute(sql`
        INSERT INTO saas_audit_events (id, tenant_id, action, target_type, target_id)
        VALUES
          (${auditIdA}::uuid, ${tenantA}::uuid, 'rls.test', 'test', ${driftIdA}),
          (${auditIdB}::uuid, ${tenantB}::uuid, 'rls.test', 'test', ${driftIdB})
      `);
    });
  });

  afterAll(async () => {
    if (!tenantA) return;
    const { withBypassRls } = await import("../../src/db");
    await withBypassRls(async (db) => {
      // ON DELETE CASCADE on the FK takes care of the children, but
      // we still drop drift_events explicitly because it doesn't
      // FK to saas_tenants (looser coupling, partitioned table).
      await db.execute(sql`DELETE FROM drift_events WHERE tenant_id IN (${tenantA}::uuid, ${tenantB}::uuid)`);
      await db.execute(sql`DELETE FROM saas_tenants WHERE id IN (${tenantA}::uuid, ${tenantB}::uuid)`);
    });
  });

  it("SELECT under tenant A's RLS context returns only tenant A's drift rows", async () => {
    const { withTenantRls } = await import("../../src/db");
    const seen = await withTenantRls(tenantA, async (tx) => {
      const r = await tx.execute<{ id: string; tenant_id: string; title: string }>(
        sql`SELECT id, tenant_id, title FROM drift_events WHERE tenant_id IN (${tenantA}::uuid, ${tenantB}::uuid)`,
      );
      return r.rows;
    });
    // RLS must filter out tenant B even though the WHERE clause asked for both.
    expect(seen.length).toBe(1);
    expect(seen[0].tenant_id).toBe(tenantA);
    expect(seen.find((r) => r.tenant_id === tenantB)).toBeUndefined();
  });

  it("SELECT under tenant A's RLS context returns only tenant A's audit rows", async () => {
    const { withTenantRls } = await import("../../src/db");
    const seen = await withTenantRls(tenantA, async (tx) => {
      const r = await tx.execute<{ id: string; tenant_id: string }>(
        sql`SELECT id, tenant_id FROM saas_audit_events WHERE tenant_id IN (${tenantA}::uuid, ${tenantB}::uuid)`,
      );
      return r.rows;
    });
    expect(seen.length).toBe(1);
    expect(seen[0].tenant_id).toBe(tenantA);
  });

  it("UPDATE targeting tenant B from tenant A's context affects 0 rows", async () => {
    const { withTenantRls } = await import("../../src/db");
    const affected = await withTenantRls(tenantA, async (tx) => {
      const r = await tx.execute(
        sql`UPDATE drift_events SET title = 'PWNED' WHERE id = ${driftIdB}::uuid`,
      );
      // node-pg returns rowCount on UPDATE/DELETE results.
      return r.rowCount ?? 0;
    });
    expect(affected).toBe(0);
  });

  it("DELETE targeting tenant B from tenant A's context affects 0 rows", async () => {
    const { withTenantRls } = await import("../../src/db");
    const affected = await withTenantRls(tenantA, async (tx) => {
      const r = await tx.execute(
        sql`DELETE FROM saas_audit_events WHERE id = ${auditIdB}::uuid`,
      );
      return r.rowCount ?? 0;
    });
    expect(affected).toBe(0);
  });

  it("symmetry: tenant B's context does not see tenant A's data either", async () => {
    const { withTenantRls } = await import("../../src/db");
    const seen = await withTenantRls(tenantB, async (tx) => {
      const r = await tx.execute<{ tenant_id: string }>(
        sql`SELECT tenant_id FROM drift_events WHERE id = ${driftIdA}::uuid`,
      );
      return r.rows;
    });
    expect(seen.length).toBe(0);
  });
});
