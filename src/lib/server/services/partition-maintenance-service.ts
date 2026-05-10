/**
 * Preemptive partition maintenance for `drift_events`.
 *
 * `drift_events` is RANGE-partitioned by `created_at` (monthly).
 * Migration `0003_drift_events_partition.sql` bootstraps 2026 and
 * defines `create_next_drift_events_partition()` — but the helper is
 * NOT scheduled. If nobody calls it, inserts that fall outside the
 * existing monthly partitions land in `drift_events_default`, which
 * defeats partition pruning and turns retention drops into table
 * scans. Worse, on the calendar boundary if the default partition
 * ALSO doesn't cover the date (e.g. operator dropped it during a
 * cleanup), inserts fail outright — a SEV-1 for drift detection.
 *
 * This job calls the helper N times to ensure the next
 * `MAINTENANCE_PARTITION_LOOKAHEAD_MONTHS` (default 2) months of
 * partitions exist. The helper is idempotent — `CREATE TABLE IF NOT
 * EXISTS PARTITION OF` either creates a new partition or is a no-op.
 *
 * Runs hourly by default — cheap (a single function call when nothing
 * needs creating) and gives us up to a 30-day head-start window
 * before any partition-related insert failure.
 */

import { sql } from "drizzle-orm";
import { withBypassRls } from "@/db";
import { logStructured } from "@/lib/server/log";

export interface PartitionMaintenanceResult {
  /** True when the job actually ran (vs skipped because no DB). */
  ran: boolean;
  /** Number of months ahead we ensured partitions for. */
  lookaheadMonths: number;
  /**
   * Names of partitions that existed BEFORE this run targeting the
   * lookahead window. Useful for log scraping when something was
   * created — empty `created` + populated `existing` means steady
   * state.
   */
  existing: string[];
  /** Partition names we actually created this run (may be empty). */
  created: string[];
  /** Errors per attempted month, keyed by partition name. */
  errors: Record<string, string>;
}

function lookaheadMonths(): number {
  const raw = process.env.MAINTENANCE_PARTITION_LOOKAHEAD_MONTHS?.trim();
  if (!raw) return 2;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) return 2;
  return n;
}

function partitionEveryMs(): number {
  const raw = process.env.MAINTENANCE_PARTITION_EVERY_HOURS?.trim();
  if (!raw) return 60 * 60 * 1000; // 1 h
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 60 * 60 * 1000;
  return n * 60 * 60 * 1000;
}

export const partitionMaintenanceEveryMs = partitionEveryMs;

interface MonthlySpec {
  name: string;
  startIso: string;
  endIso: string;
}

/**
 * Compute the next `count` months starting from this month. Returned
 * as ISO `YYYY-MM-DD` strings so the SQL formatter is unambiguous —
 * pure integer math, no UTC vs local clock surprises.
 */
function nextMonths(count: number, from: Date = new Date()): MonthlySpec[] {
  const out: MonthlySpec[] = [];
  // Anchor at the FIRST of the current month, UTC, so day-of-month and
  // timezone don't shift the partition boundaries.
  const baseY = from.getUTCFullYear();
  const baseM = from.getUTCMonth(); // 0-11
  for (let i = 0; i < count; i++) {
    const startY = baseY + Math.floor((baseM + i) / 12);
    const startM = (baseM + i) % 12;
    const endY = baseY + Math.floor((baseM + i + 1) / 12);
    const endM = (baseM + i + 1) % 12;
    const name = `drift_events_${startY}_${String(startM + 1).padStart(2, "0")}`;
    const startIso = `${startY}-${String(startM + 1).padStart(2, "0")}-01`;
    const endIso = `${endY}-${String(endM + 1).padStart(2, "0")}-01`;
    out.push({ name, startIso, endIso });
  }
  return out;
}

/**
 * Ensure partitions exist for the next `lookaheadMonths` months.
 *
 * Returns a structured result so the caller (ops-worker logger) can
 * emit a single log line per run. Errors per month are captured and
 * reported but do NOT abort the run — a single month's race condition
 * shouldn't prevent the others from being created.
 */
export async function ensureUpcomingDriftPartitions(
  now: Date = new Date(),
): Promise<PartitionMaintenanceResult> {
  const months = lookaheadMonths();
  const targets = nextMonths(months, now);
  const existing: string[] = [];
  const created: string[] = [];
  const errors: Record<string, string> = {};

  // RLS-BYPASS: pg_catalog read + DDL (CREATE TABLE PARTITION OF). These
  // are catalog-level operations on the drift_events parent table itself,
  // not tenant-scoped data; ops-worker is the only caller (scheduled).
  await withBypassRls(async (db) => {
    // 1. Snapshot existing partitions to differentiate created-this-run
    //    vs already-present in the log line.
    const before = await db.execute<{ relname: string }>(sql`
      SELECT c.relname FROM pg_inherits i
        JOIN pg_class p ON p.oid = i.inhparent
        JOIN pg_class c ON c.oid = i.inhrelid
       WHERE p.relname = 'drift_events'
    `);
    const present = new Set(before.rows.map((r) => r.relname));
    for (const t of targets) {
      if (present.has(t.name)) existing.push(t.name);
    }

    // 2. CREATE TABLE IF NOT EXISTS for each target month. Each call
    //    is an independent statement so a failure on one month doesn't
    //    abort the others (PostgreSQL would otherwise rollback the
    //    whole transaction on the first error). We use savepoints so
    //    the outer withBypassRls transaction can still commit.
    for (const t of targets) {
      if (present.has(t.name)) continue;
      try {
        await db.execute(sql`SAVEPOINT pm`);
        await db.execute(sql.raw(
          `CREATE TABLE IF NOT EXISTS ${t.name}
             PARTITION OF drift_events
             FOR VALUES FROM ('${t.startIso}') TO ('${t.endIso}')`,
        ));
        await db.execute(sql`RELEASE SAVEPOINT pm`);
        created.push(t.name);
      } catch (err) {
        await db.execute(sql`ROLLBACK TO SAVEPOINT pm`);
        errors[t.name] = err instanceof Error ? err.message : String(err);
      }
    }
  });

  logStructured("info", "drift_partition_maintenance", {
    lookahead_months: months,
    existing: existing.length,
    created,
    error_count: Object.keys(errors).length,
  });

  return { ran: true, lookaheadMonths: months, existing, created, errors };
}

/** Exported for tests. */
export const __test__ = { nextMonths };
