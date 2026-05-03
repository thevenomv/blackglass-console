/**
 * PostgreSQL drift history repository.
 *
 * Enabled when DATABASE_URL is set.  Uses the same `pg` package already in
 * the dependency tree.
 *
 * DDL: docs/migrations/002_baselines.sql (drift_history table)
 */

import type { DayEntry, DriftHistoryRepository } from "./types";
import { StoreError } from "./types";
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
      const res = await this.pool.query<{ ymd: string; total_new_findings: number }>(
        "SELECT ymd, total_new_findings FROM blackglass_drift_history ORDER BY ymd DESC LIMIT 90",
      );
      return res.rows.map((r) => ({ ymd: r.ymd, totalNewFindings: r.total_new_findings }));
    } catch (err) {
      console.error("[drift-history/pg] Failed to get days:", err);
      throw new StoreError("unavailable", "Postgres read failed", err);
    }
  }
}
