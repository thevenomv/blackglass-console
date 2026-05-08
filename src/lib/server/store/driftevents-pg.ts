/**
 * PostgresDriftEventsRepository
 *
 * Stores the latest computed drift events per host as a JSONB array in
 * `blackglass_drift_events`.  One row per hostId; each scan overwrites the
 * previous result.
 *
 * Activated when `DATABASE_URL` is set (same as baseline-pg).
 * DDL: drizzle/0003_drift_events_partition.sql (canonical, partitioned)
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
    // DO managed Postgres uses a self-signed CA — strip sslmode from URL and
    // pass ssl options explicitly so pg v8 doesn't reject the cert chain.
    const cleanUrl = conn.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
    const sslOpts = conn.includes("sslmode=") ? { ssl: { rejectUnauthorized: false } } : {};
    g[POOL_KEY] = new PgPool({ connectionString: cleanUrl, max: 4, ...sslOpts });
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

  /**
   * Tenant-scoped read for data exports — returns up to `limit` events
   * across the supplied collector host_ids, newest first.  Intentionally
   * permissive on size: the export job caps the JSON it builds, not this
   * call.
   */
  async listByHostIds(hostIds: string[], limit = 5000): Promise<DriftEvent[]> {
    if (hostIds.length === 0) return [];
    const pool = await getPool();
    const res = await pool.query<{ events: DriftEvent[] }>(
      "SELECT events FROM blackglass_drift_events WHERE host_id = ANY($1::text[]) ORDER BY updated_at DESC",
      [hostIds],
    );
    const all: DriftEvent[] = [];
    for (const row of res.rows) all.push(...(row.events as DriftEvent[]));
    all.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
    return all.slice(0, limit);
  },

  async hasAny(): Promise<boolean> {
    const pool = await getPool();
    const res = await pool.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM blackglass_drift_events WHERE jsonb_array_length(events) > 0) AS exists",
    );
    return res.rows[0]?.exists ?? false;
  },

  /**
   * Per-day severity buckets for the last N days.
   *
   * When `hostIds` is provided, only events from those host_ids count — used
   * to scope the trend to a single tenant's collector hosts.  When omitted,
   * counts span every host (legacy single-tenant mode).
   */
  async trendByDay(
    days: number,
    hostIds?: string[],
  ): Promise<Array<{ ymd: string; severity: string; count: number }>> {
    if (hostIds !== undefined && hostIds.length === 0) return [];
    const pool = await getPool();
    const params: Array<unknown> = [days];
    let hostFilter = "";
    if (hostIds && hostIds.length > 0) {
      params.push(hostIds);
      hostFilter = `AND host_id = ANY($${params.length}::text[])`;
    }
    const res = await pool.query<{ ymd: string; severity: string; cnt: string }>(
      `SELECT
         to_char((e->>'detectedAt')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS ymd,
         e->>'severity' AS severity,
         COUNT(*)::text AS cnt
       FROM blackglass_drift_events,
            jsonb_array_elements(events) AS e
       WHERE (e->>'detectedAt')::timestamptz >= NOW() - ($1 || ' days')::interval
         ${hostFilter}
       GROUP BY 1, 2
       ORDER BY 1`,
      params,
    );
    return res.rows.map((r) => ({
      ymd: r.ymd,
      severity: r.severity,
      count: parseInt(r.cnt, 10) || 0,
    }));
  },
};
