/**
 * GET /api/admin/partition-health
 *
 * Reports the health of the `drift_events` monthly partition
 * lookahead. Operators (and the Settings → Runtime panel) use this
 * to confirm the ops-worker partition-maintenance job is keeping
 * pace with the calendar.
 *
 * Healthy means: every month in the configured lookahead window
 * (default = next 2) has a partition. Unhealthy means at least one
 * upcoming month is missing — inserts that fall in that month
 * will land in the default partition (slow drops, broken query
 * plans) or fail outright if the default partition has been
 * dropped.
 *
 * Auth: owner/admin only (`secrets.manage` permission — same gate
 * as the rate-limits and queues admin routes).
 *
 * Response shape:
 * {
 *   db_configured: boolean,
 *   generatedAt: ISO,
 *   lookaheadMonths: number,
 *   healthy: boolean,
 *   present: string[],     // partition names found in the lookahead window
 *   missing: string[],     // partition names absent from the lookahead window
 *   defaultPartitionExists: boolean,
 * }
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { tryGetDb, withBypassRls } from "@/db";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function lookaheadMonths(): number {
  const raw = process.env.MAINTENANCE_PARTITION_LOOKAHEAD_MONTHS?.trim();
  if (!raw) return 2;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) return 2;
  return n;
}

function expectedPartitionNames(months: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  const baseY = from.getUTCFullYear();
  const baseM = from.getUTCMonth();
  for (let i = 0; i < months; i++) {
    const y = baseY + Math.floor((baseM + i) / 12);
    const m = (baseM + i) % 12;
    out.push(`drift_events_${y}_${String(m + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  const auth = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!auth.ok) return auth.response;

  if (!tryGetDb()) {
    return NextResponse.json(
      { db_configured: false, generatedAt: new Date().toISOString() },
      { headers: { "x-request-id": requestId } },
    );
  }

  const months = lookaheadMonths();
  const expected = expectedPartitionNames(months);

  // Snapshot the partitions Postgres knows about for drift_events.
  const present = new Set<string>();
  let defaultPartitionExists = false;
  try {
    // RLS-BYPASS: pg_catalog read for partition-health diagnostics; queries
    // pg_inherits / pg_class which are not tenant-scoped tables.
    await withBypassRls(async (db) => {
      const rows = await db.execute<{ relname: string }>(sql`
        SELECT c.relname FROM pg_inherits i
          JOIN pg_class p ON p.oid = i.inhparent
          JOIN pg_class c ON c.oid = i.inhrelid
         WHERE p.relname = 'drift_events'
      `);
      for (const r of rows.rows) {
        present.add(r.relname);
        if (r.relname === "drift_events_default") defaultPartitionExists = true;
      }
    });
  } catch (err) {
    return NextResponse.json(
      {
        db_configured: true,
        generatedAt: new Date().toISOString(),
        lookaheadMonths: months,
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }

  const missing = expected.filter((name) => !present.has(name));
  const healthy = missing.length === 0;

  return NextResponse.json(
    {
      db_configured: true,
      generatedAt: new Date().toISOString(),
      lookaheadMonths: months,
      healthy,
      present: expected.filter((name) => present.has(name)),
      missing,
      defaultPartitionExists,
    },
    { headers: { "x-request-id": requestId } },
  );
}
