#!/usr/bin/env node

/**
 * verify-partition-integrity.mjs — Day-2 ops sanity check.
 *
 * Verifies the `drift_events` partitioned table is healthy and that
 * Row-Level Security hasn't silently leaked. Designed to run from
 * cron (weekly) or before/after a partition swap or migration. Exits
 * non-zero on any failed check so a CI pipeline or operator script
 * can flag the failure.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/ops/verify-partition-integrity.mjs
 *   DATABASE_URL=postgres://... node scripts/ops/verify-partition-integrity.mjs --json
 *
 * Checks performed:
 *
 *   1. Parent table exists and is range-partitioned on `created_at`.
 *   2. At least one named partition exists for the current calendar
 *      month (rows would otherwise spill into `drift_events_default`,
 *      which is undesirable for retention).
 *   3. A named partition exists for the *next* calendar month — this
 *      is what `create_next_drift_events_partition()` is supposed to
 *      maintain. Missing future partitions are the most common cause
 *      of "drift events suddenly stopped landing in the queryable
 *      table" incidents.
 *   4. The default partition is empty (rows in default = a missing
 *      named partition somewhere upstream).
 *   5. `drift_events_tenant_isolation` RLS policy is attached and
 *      `relrowsecurity = true` on the parent. Catches the case where
 *      a manual `ALTER TABLE drift_events DISABLE ROW LEVEL SECURITY`
 *      slipped through review.
 *   6. Quick row-count by partition so the operator can eyeball
 *      whether a month is suspiciously empty / large.
 *
 * Exit codes:
 *   0   all checks pass
 *   1   one or more checks failed (see report)
 *   2   could not connect / unexpected error
 */

import pg from "pg";
const { Client } = pg;

const wantJson = process.argv.includes("--json");

function out(check, ok, detail) {
  return { check, ok, detail };
}

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set");
    process.exit(2);
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
  } catch (e) {
    console.error("[verify-partition-integrity] connect failed:", e.message);
    process.exit(2);
  }

  const results = [];

  // 1. Parent exists and is partitioned by RANGE
  {
    const r = await client.query(`
      SELECT c.relkind, p.partstrat
      FROM pg_class c
      LEFT JOIN pg_partitioned_table p ON p.partrelid = c.oid
      WHERE c.relname = 'drift_events' AND c.relkind IN ('p','r')
    `);
    if (r.rows.length === 0) {
      results.push(out("parent_exists", false, "drift_events table not found"));
    } else {
      const row = r.rows[0];
      results.push(
        out(
          "parent_exists",
          row.relkind === "p" && row.partstrat === "r",
          `relkind=${row.relkind} partstrat=${row.partstrat ?? "none"}`,
        ),
      );
    }
  }

  // List all named monthly partitions
  const partitionsRes = await client.query(`
    SELECT
      child.relname AS name,
      pg_get_expr(child.relpartbound, child.oid) AS bounds
    FROM pg_inherits i
    JOIN pg_class parent ON parent.oid = i.inhparent
    JOIN pg_class child  ON child.oid  = i.inhrelid
    WHERE parent.relname = 'drift_events'
    ORDER BY child.relname
  `);
  const partitions = partitionsRes.rows;

  // 2. Current-month partition exists
  const now = new Date();
  const currentTag = `drift_events_${now.getUTCFullYear()}_${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  results.push(
    out(
      "current_month_partition",
      partitions.some((p) => p.name === currentTag),
      `looking for ${currentTag} — found ${partitions.length} partition(s)`,
    ),
  );

  // 3. Next-month partition exists (we want create_next_drift_events_partition to be running)
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const nextTag = `drift_events_${next.getUTCFullYear()}_${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  results.push(
    out(
      "next_month_partition",
      partitions.some((p) => p.name === nextTag),
      `looking for ${nextTag} — call SELECT create_next_drift_events_partition() if missing`,
    ),
  );

  // 4. Default partition is empty
  {
    const r = await client.query(
      `SELECT COUNT(*)::bigint AS n FROM drift_events_default`,
    );
    const n = Number(r.rows[0].n);
    results.push(
      out(
        "default_partition_empty",
        n === 0,
        n === 0
          ? "0 rows — good"
          : `${n} rows in default partition; a named monthly partition is missing upstream`,
      ),
    );
  }

  // 5. RLS policy attached + RLS enabled on parent
  {
    const r = await client.query(`
      SELECT c.relrowsecurity, c.relforcerowsecurity,
             (SELECT COUNT(*)::int FROM pg_policies WHERE tablename = 'drift_events'
              AND policyname = 'drift_events_tenant_isolation') AS policy_count
      FROM pg_class c
      WHERE c.relname = 'drift_events'
    `);
    const row = r.rows[0] ?? { relrowsecurity: false, policy_count: 0 };
    results.push(
      out(
        "rls_enabled",
        Boolean(row.relrowsecurity),
        `relrowsecurity=${row.relrowsecurity} relforcerowsecurity=${row.relforcerowsecurity ?? false}`,
      ),
    );
    results.push(
      out(
        "rls_policy_attached",
        row.policy_count > 0,
        `drift_events_tenant_isolation policy_count=${row.policy_count}`,
      ),
    );
  }

  // 6. Per-partition row counts (informational, never failing)
  const counts = [];
  for (const p of partitions) {
    try {
      const r = await client.query(`SELECT COUNT(*)::bigint AS n FROM ${p.name}`);
      counts.push({ partition: p.name, rows: Number(r.rows[0].n), bounds: p.bounds });
    } catch (e) {
      counts.push({ partition: p.name, rows: -1, bounds: p.bounds, error: e.message });
    }
  }

  await client.end();

  const failed = results.filter((r) => !r.ok);
  const summary = {
    ok: failed.length === 0,
    failed: failed.length,
    checks: results,
    partitions: counts,
    generatedAt: new Date().toISOString(),
  };

  if (wantJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\n=== drift_events partition integrity ===`);
    for (const r of results) {
      const mark = r.ok ? "PASS" : "FAIL";
      console.log(`  [${mark}] ${r.check} — ${r.detail}`);
    }
    console.log(`\n=== Per-partition row counts ===`);
    for (const c of counts) {
      console.log(`  ${c.partition.padEnd(30)} ${String(c.rows).padStart(8)} rows  ${c.bounds}`);
    }
    console.log(
      `\nResult: ${summary.ok ? "OK" : `${summary.failed} check(s) FAILED`}\n`,
    );
  }

  process.exit(summary.ok ? 0 : 1);
}

run().catch((e) => {
  console.error("[verify-partition-integrity] unexpected error:", e);
  process.exit(2);
});
