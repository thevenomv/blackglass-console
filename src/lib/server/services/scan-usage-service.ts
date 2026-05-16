/**
 * Per-tenant scan-cost telemetry — atomic monthly counters.
 *
 * Called fire-and-forget from `executeDriftScanJobImpl` whenever a SaaS
 * tenant scan completes (success or partial).  Failures are logged but
 * never surface to the scan pipeline.
 *
 * Schema: src/db/schema/scan-usage.ts → saasScanUsage
 * Migration: drizzle/0026_tenant_scan_usage.sql
 */
import { sql } from "drizzle-orm";
import { tryGetDb, schema } from "@/db";

const { saasScanUsage } = schema;

/**
 * Upsert the current-month usage counters for `tenantId`.
 *
 * - Increments `scan_jobs` by 1 (one completed scan job).
 * - Increments `host_scans` by `hostScans` (number of hosts successfully
 *   collected in this job).
 *
 * No-ops silently when DATABASE_URL is not configured (non-SaaS deployments).
 */
export async function recordScanUsage(args: {
  tenantId: string;
  /** Number of hosts successfully scanned in this job. */
  hostScans: number;
}): Promise<void> {
  const db = tryGetDb();
  if (!db) return;

  const { tenantId, hostScans } = args;

  // Truncate to first day of the current UTC month.
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  try {
    await db
      .insert(saasScanUsage)
      .values({
        tenantId,
        periodStart,
        scanJobs: 1,
        hostScans,
      })
      .onConflictDoUpdate({
        target: [saasScanUsage.tenantId, saasScanUsage.periodStart],
        set: {
          scanJobs: sql`${saasScanUsage.scanJobs} + 1`,
          hostScans: sql`${saasScanUsage.hostScans} + ${hostScans}`,
          updatedAt: sql`now()`,
        },
      });
  } catch (err) {
    // Never let telemetry failure affect the scan result.
    console.error("[scan-usage] Failed to record scan usage:", err);
  }
}
