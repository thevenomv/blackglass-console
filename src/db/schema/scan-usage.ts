/**
 * Per-tenant scan-cost telemetry (unit economics).
 */
import { integer, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { saasTenants } from "./saas";

/**
 * Monthly scan-usage counters for unit-economics visibility.
 *
 * Each row represents one (tenant, billing-month) pair.  `periodStart` is
 * always truncated to the first day of the UTC month so twelve rows give a
 * clean 12-month cost trend.
 *
 * - `scanJobs`  — number of scan jobs completed this month
 * - `hostScans` — cumulative count of individual host scans (one job may
 *                 scan N hosts simultaneously)
 *
 * Incremented atomically via INSERT … ON CONFLICT DO UPDATE in the scan
 * worker so concurrent jobs never race.  Read by the admin API and the
 * operator dashboard for unit-economics reporting.
 *
 * See drizzle/0026_tenant_scan_usage.sql for the migration DDL.
 */
export const saasScanUsage = pgTable(
  "saas_scan_usage",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    /** First day of the UTC month — the billing-period key. */
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    /** Number of scan jobs completed in this period. */
    scanJobs: integer("scan_jobs").notNull().default(0),
    /** Cumulative individual host scans in this period. */
    hostScans: integer("host_scans").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.periodStart] }),
  }),
);

export type SaasScanUsage = typeof saasScanUsage.$inferSelect;
