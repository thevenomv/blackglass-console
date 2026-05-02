/**
 * PostgresDriftEventsRepository
 *
 * Stores the latest computed drift events per host as a JSONB array in
 * `blackglass_drift_events`.  One row per hostId; each scan overwrites the
 * previous result.
 *
 * Activated when `DATABASE_URL` is set (same as baseline-pg).
 * DDL: docs/migrations/003_drift_events.sql
 */

import type { Pool } from "pg";
import type { DriftEvent } from "@/data/mock/types";

const POOL_KEY = "__blackglass_drift_events_pg_pool_v1" as const;
type G = typeof globalThis & { [POOL_KEY]?: Pool };

async function getPool(): Promise<Pool> {
  const conn = process.env.DATABASE_URL!;
  const g = globalThis as G;
  if (!g[POOL_KEY]) {
    const { Pool: PgPool } = await import("pg");
    g[POOL_KEY] = new PgPool({ connectionString: conn, max: 4 });
  }
  return g[POOL_KEY]!;
}

export const PostgresDriftEventsRepository = {
  async store(hostId: string, events: DriftEvent[]): Promise<void> {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO blackglass_drift_events (host_id, events, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (host_id) DO UPDATE
         SET events = EXCLUDED.events,
             updated_at = EXCLUDED.updated_at`,
      [hostId, JSON.stringify(events)],
    );
  },

  async get(hostId: string): Promise<DriftEvent[]> {
    const pool = await getPool();
    const res = await pool.query<{ events: DriftEvent[] }>(
      "SELECT events FROM blackglass_drift_events WHERE host_id = $1",
      [hostId],
    );
    return (res.rows[0]?.events as DriftEvent[]) ?? [];
  },

  async getAll(): Promise<DriftEvent[]> {
    const pool = await getPool();
    const res = await pool.query<{ events: DriftEvent[] }>(
      "SELECT events FROM blackglass_drift_events ORDER BY updated_at DESC",
    );
    const all: DriftEvent[] = [];
    for (const row of res.rows) all.push(...(row.events as DriftEvent[]));
    return all.sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    );
  },

  async hasAny(): Promise<boolean> {
    const pool = await getPool();
    const res = await pool.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM blackglass_drift_events WHERE jsonb_array_length(events) > 0) AS exists",
    );
    return res.rows[0]?.exists ?? false;
  },
};
