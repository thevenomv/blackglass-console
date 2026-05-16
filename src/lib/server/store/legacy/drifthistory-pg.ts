/**
 * PostgreSQL drift history repository.
 *
 * Enabled when DATABASE_URL is set.  Uses the same `pg` package already in
 * the dependency tree.
 *
 * DDL: docs/sql/baselines-and-drift-history.sql (drift_history table)
 */

import type { DayEntry, DriftHistoryRepository } from "../types";
import { StoreError } from "../types";
import type { Pool } from "pg";

const POOL_KEY = "__blackglass_drifthist_pg_pool_v1" as const;
type G = typeof globalThis & { [POOL_KEY]?: Pool };

function getPool(url: string): Pool {
  const g = globalThis as G;
  if (!g[POOL_KEY]) {
    const { Pool: PgPool } = require("pg") as typeof import("pg");
    const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
    const sslOpts = url.includes("sslmode=") ? { ssl: { rejectUnauthorized: false } } : {};
    g[POOL_KEY] = new PgPool({ connectionString: cleanUrl, max: 3, ...sslOpts });
  }
  return g[POOL_KEY]!;
}

export class PostgresDriftHistoryRepository implements DriftHistoryRepository {
  readonly adapter = "postgres" as const;
  private readonly pool: Pool;

  constructor(private readonly url: string) {
    this.pool = getPool(url);
  }

  async recordDay(count: number): Promise<void> {
    const ymd = new Date().toISOString().slice(0, 10);
    try {
      await this.pool.query(
        `INSERT INTO blackglass_drift_history (ymd, total_new_findings)
         VALUES ($1, $2)
         ON CONFLICT (ymd) DO UPDATE
           SET total_new_findings = blackglass_drift_history.total_new_findings + EXCLUDED.total_new_findings`,
        [ymd, count],
      );
    } catch (err) {
      console.error("[drift-history/pg] Failed to record day:", err);
      throw new StoreError("unavailable", "Postgres write failed", err);
    }
  }

  async getDays(): Promise<DayEntry[]> {
    try {
      // CAST is critical: pg returns DATE columns as JS Date objects, but
      // the chart helper concatenates `ymd + "T12:00:00.000Z"` to build
      // a timestamp. A Date stringifies to "Wed May 07 2026 ..." which
      // produces "Invalid Date" downstream. TO_CHAR forces YYYY-MM-DD text.
      // Caused the "Invalid Date Invalid Date" labels seen in the Fleet
      // overview drift chart on 2026-05-07.
      //
      // Order ASC so callers can `.slice(-6)` to get the most recent 6
      // (the previous DESC order made `.slice(-6)` return the OLDEST 6).
      const res = await this.pool.query<{ ymd: string; total_new_findings: number }>(
        `SELECT TO_CHAR(ymd, 'YYYY-MM-DD') AS ymd, total_new_findings
         FROM blackglass_drift_history
         ORDER BY ymd ASC
         LIMIT 90`,
      );
      return res.rows.map((r) => ({ ymd: r.ymd, totalNewFindings: r.total_new_findings }));
    } catch (err) {
      console.error("[drift-history/pg] Failed to get days:", err);
      throw new StoreError("unavailable", "Postgres read failed", err);
    }
  }
}
