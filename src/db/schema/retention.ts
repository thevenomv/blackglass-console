/**
 * Per-tenant data retention policies.
 */
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { saasTenants } from "./saas";

/**
 * Tenant-controlled retention windows for the long-tail telemetry tables.
 *
 * A nightly worker job (`retention-cleanup-worker.ts`) walks every tenant
 * with a row here and deletes records older than the configured number of
 * days for each data class.  When no row exists, the deployment-wide
 * fallback is used (the historic behaviour — keep everything).
 *
 * Setting any column to NULL or 0 disables retention for that data class;
 * keep-forever wins over the global default.
 */
export const saasRetentionPolicies = pgTable("saas_retention_policies", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  /** Days to keep `blackglass_drift_events` rows. */
  driftEventsDays: integer("drift_events_days"),
  /** Days to keep `blackglass_baselines` snapshots beyond the most recent per host. */
  baselineSnapshotsDays: integer("baseline_snapshots_days"),
  /** Days to keep `saas_audit_events` rows. */
  auditEventsDays: integer("audit_events_days"),
  /** Days to keep `saas_evidence_bundles` rows + their underlying objects. */
  evidenceBundlesDays: integer("evidence_bundles_days"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SaasRetentionPolicy = typeof saasRetentionPolicies.$inferSelect;
