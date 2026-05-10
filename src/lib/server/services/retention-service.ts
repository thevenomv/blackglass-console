/**
 * Tenant retention policy service.
 *
 * Reads / writes `saas_retention_policies` and exposes a pure
 * `pruneTenantData()` runner used by the nightly cleanup worker.  The runner
 * is split out so it can be invoked by both the worker and a one-shot CLI
 * (`npm run retention:run -- --tenant=<id>`).
 *
 * Deletion strategy:
 * - drift_events / audit_events / evidence_bundles: hard delete by created_at
 * - baselines: keep the most recent snapshot per host, then delete older rows
 *
 * NULL or 0 retention values disable pruning for that data class — the
 * tenant has explicitly opted into keep-forever.
 */

import { withBypassRls, withTenantRls, schema, tryGetDb } from "@/db";
import { and, desc, eq, lt, sql } from "drizzle-orm";

const { saasRetentionPolicies, saasAuditEvents, saasEvidenceBundles, saasCollectorHosts } = schema;

export interface RetentionPolicy {
  driftEventsDays: number | null;
  baselineSnapshotsDays: number | null;
  auditEventsDays: number | null;
  evidenceBundlesDays: number | null;
}

export interface RetentionRunResult {
  tenantId: string;
  driftEventsDeleted: number;
  baselineSnapshotsDeleted: number;
  auditEventsDeleted: number;
  evidenceBundlesDeleted: number;
  errors: string[];
}

const DEFAULTS: RetentionPolicy = {
  driftEventsDays: null,
  baselineSnapshotsDays: null,
  auditEventsDays: null,
  evidenceBundlesDays: null,
};

function rowToPolicy(
  row: typeof saasRetentionPolicies.$inferSelect | undefined,
): RetentionPolicy {
  if (!row) return DEFAULTS;
  return {
    driftEventsDays: row.driftEventsDays,
    baselineSnapshotsDays: row.baselineSnapshotsDays,
    auditEventsDays: row.auditEventsDays,
    evidenceBundlesDays: row.evidenceBundlesDays,
  };
}

export async function getRetentionPolicy(tenantId: string): Promise<RetentionPolicy> {
  if (!tryGetDb()) return DEFAULTS;
  const [row] = await withTenantRls(tenantId, (db) =>
    db.select().from(saasRetentionPolicies).where(eq(saasRetentionPolicies.tenantId, tenantId)),
  );
  return rowToPolicy(row);
}

export async function setRetentionPolicy(
  tenantId: string,
  actorUserId: string | null,
  input: Partial<RetentionPolicy>,
): Promise<RetentionPolicy> {
  const normalized = {
    driftEventsDays: normalizeDays(input.driftEventsDays),
    baselineSnapshotsDays: normalizeDays(input.baselineSnapshotsDays),
    auditEventsDays: normalizeDays(input.auditEventsDays),
    evidenceBundlesDays: normalizeDays(input.evidenceBundlesDays),
  };
  const [row] = await withTenantRls(tenantId, (db) =>
    db
      .insert(saasRetentionPolicies)
      .values({
        tenantId,
        ...normalized,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: saasRetentionPolicies.tenantId,
        set: {
          ...normalized,
          updatedBy: actorUserId,
          updatedAt: new Date(),
        },
      })
      .returning(),
  );
  return rowToPolicy(row);
}

function normalizeDays(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.min(36500, Math.floor(v));
}

/**
 * Apply a tenant's retention policy.  Returns per-class delete counts.
 * Always uses bypass-RLS (worker runs without per-request tenant context)
 * but explicitly filters every query by tenantId so cross-tenant deletes
 * remain impossible by construction.
 */
export async function pruneTenantData(tenantId: string): Promise<RetentionRunResult> {
  const policy = await getRetentionPolicy(tenantId);
  const result: RetentionRunResult = {
    tenantId,
    driftEventsDeleted: 0,
    baselineSnapshotsDeleted: 0,
    auditEventsDeleted: 0,
    evidenceBundlesDeleted: 0,
    errors: [],
  };

  // Audit events (Drizzle) ----------------------------------------------------
  if (policy.auditEventsDays && policy.auditEventsDays > 0) {
    const cutoff = new Date(Date.now() - policy.auditEventsDays * 86_400_000);
    try {
      // RLS-BYPASS: nightly retention worker; tenantId interpolated into
      // every WHERE clause so cross-tenant deletes are impossible by
      // construction (asserted by tests in retention-service.test.ts).
      const rows = await withBypassRls((db) =>
        db
          .delete(saasAuditEvents)
          .where(
            and(
              eq(saasAuditEvents.tenantId, tenantId),
              lt(saasAuditEvents.createdAt, cutoff),
            ),
          )
          .returning({ id: saasAuditEvents.id }),
      );
      result.auditEventsDeleted = rows.length;
    } catch (err) {
      result.errors.push(`audit: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Evidence bundles (Drizzle) ----------------------------------------------
  if (policy.evidenceBundlesDays && policy.evidenceBundlesDays > 0) {
    const cutoff = new Date(Date.now() - policy.evidenceBundlesDays * 86_400_000);
    try {
      // RLS-BYPASS: nightly retention worker; same tenant-scoping pattern
      // as the audit-events delete above.
      const rows = await withBypassRls((db) =>
        db
          .delete(saasEvidenceBundles)
          .where(
            and(
              eq(saasEvidenceBundles.tenantId, tenantId),
              lt(saasEvidenceBundles.createdAt, cutoff),
            ),
          )
          .returning({ id: saasEvidenceBundles.id }),
      );
      result.evidenceBundlesDeleted = rows.length;
    } catch (err) {
      result.errors.push(`evidence: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Drift events + baselines live on the legacy non-Drizzle tables and are
  // pruned via raw SQL through the shared pool.  Both delete sets are
  // explicitly scoped to the tenant's saas_collector_hosts rows so we can
  // never widen the blast radius.
  if (
    (policy.driftEventsDays && policy.driftEventsDays > 0) ||
    (policy.baselineSnapshotsDays && policy.baselineSnapshotsDays > 0)
  ) {
    try {
      // RLS-BYPASS: collect this tenant's host ids (legacy drift-events /
      // baselines tables are scoped by host_id, so we need this list).
      const tenantHostIds = await withBypassRls((db) =>
        db
          .select({ id: saasCollectorHosts.id })
          .from(saasCollectorHosts)
          .where(eq(saasCollectorHosts.tenantId, tenantId)),
      );
      const hostIds = tenantHostIds.map((r) => r.id);

      if (hostIds.length === 0) {
        // Tenant has no hosts; nothing to delete here without risking a wildcard.
        return result;
      }

      // Use raw SQL via Drizzle's `sql` template — driftevents-pg uses its
      // own connection pool but we can route through Drizzle's pool for the
      // worker's atomic delete.
      if (policy.driftEventsDays && policy.driftEventsDays > 0) {
        const cutoff = new Date(Date.now() - policy.driftEventsDays * 86_400_000);
        // RLS-BYPASS: drift_events legacy table is host_id-keyed; the host
        // id list above came from THIS tenant only, so the ANY() filter
        // can't widen across tenants.
        const deleted = await withBypassRls(async (db) => {
          const r = await db.execute(sql`
            DELETE FROM blackglass_drift_events
            WHERE host_id = ANY(${hostIds})
              AND detected_at < ${cutoff}
            RETURNING id
          `);
          // pg `Result.rows` length on raw execute
          return Array.isArray(r) ? r.length : (r as { rowCount?: number }).rowCount ?? 0;
        });
        result.driftEventsDeleted = typeof deleted === "number" ? deleted : 0;
      }

      if (policy.baselineSnapshotsDays && policy.baselineSnapshotsDays > 0) {
        const cutoff = new Date(Date.now() - policy.baselineSnapshotsDays * 86_400_000);
        // RLS-BYPASS: baselines legacy table; same tenant-scoping argument
        // via host_id ANY() as the drift_events delete above.
        const deleted = await withBypassRls(async (db) => {
          // Keep the latest snapshot per host regardless of age, then delete
          // older snapshots beyond the cutoff.
          const r = await db.execute(sql`
            DELETE FROM blackglass_baselines b
            WHERE b.host_id = ANY(${hostIds})
              AND b.collected_at < ${cutoff}
              AND b.collected_at < (
                SELECT MAX(collected_at) FROM blackglass_baselines
                WHERE host_id = b.host_id
              )
            RETURNING id
          `);
          return Array.isArray(r) ? r.length : (r as { rowCount?: number }).rowCount ?? 0;
        });
        result.baselineSnapshotsDeleted = typeof deleted === "number" ? deleted : 0;
      }
    } catch (err) {
      result.errors.push(`pg: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/**
 * Worker entry: list every tenant with a retention policy row and run the
 * pruner against each one.  Tenants with no policy keep current behaviour
 * (no automatic deletion).
 */
export async function pruneAllTenants(): Promise<RetentionRunResult[]> {
  if (!tryGetDb()) return [];
  // RLS-BYPASS: ops-worker fan-out — enumerates every tenant with a
  // retention policy row and runs pruneTenantData() per tenant. Each
  // per-tenant call is itself tenant-scoped above.
  const tenants = await withBypassRls((db) =>
    db
      .select({ tenantId: saasRetentionPolicies.tenantId })
      .from(saasRetentionPolicies)
      .orderBy(desc(saasRetentionPolicies.updatedAt)),
  );
  const results: RetentionRunResult[] = [];
  for (const { tenantId } of tenants) {
    try {
      results.push(await pruneTenantData(tenantId));
    } catch (err) {
      results.push({
        tenantId,
        driftEventsDeleted: 0,
        baselineSnapshotsDeleted: 0,
        auditEventsDeleted: 0,
        evidenceBundlesDeleted: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }
  return results;
}
