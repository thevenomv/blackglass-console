/**
 * PostgreSQL baseline repository.
 *
 * Enabled when DATABASE_URL is set.  Uses the same `pg` package already in
 * the dependency tree (serverExternalPackages in next.config.ts).
 *
 * DDL: docs/migrations/002_baselines.sql
 *
 * tenant_id is included as a non-enforced column from day one so that adding
 * Row-Level Security at Stage 3 requires only a policy change, not a schema
 * migration.
 */

import type { HostSnapshot } from "@/lib/server/collector/types";
import type { BaselineRepository, BaselineStoreHealth } from "./types";
import { StoreError } from "./types";
import type { Pool } from "pg";

const POOL_KEY = "__blackglass_baseline_pg_pool_v1" as const;
type G = typeof globalThis & { [POOL_KEY]?: Pool };

function getPool(url: string): Pool {
  const g = globalThis as G;
  if (!g[POOL_KEY]) {
    // Dynamic import keeps `pg` out of client bundles (serverExternalPackages).
    // We assign synchronously after the first resolution to avoid races.
    const { Pool: PgPool } = require("pg") as typeof import("pg");
    g[POOL_KEY] = new PgPool({ connectionString: url, max: 5 });
  }
  return g[POOL_KEY]!;
}

export class PostgresBaselineRepository implements BaselineRepository {
  private readonly pool: Pool;

  constructor(private readonly url: string) {
    this.pool = getPool(url);
  }

  async save(snapshot: HostSnapshot): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO blackglass_baselines (host_id, hostname, collected_at, data)
         VALUES ($1, $2, $3::timestamptz, $4::jsonb)
         ON CONFLICT (host_id) DO UPDATE
           SET hostname = EXCLUDED.hostname,
               collected_at = EXCLUDED.collected_at,
               data = EXCLUDED.data`,
        [snapshot.hostId, snapshot.hostname, snapshot.collectedAt, JSON.stringify(snapshot)],
      );
    } catch (err) {
      console.error("[baseline-store/pg] Failed to save:", err);
      throw new StoreError("unavailable", "Postgres write failed", err);
    }
  }

  async get(hostId: string): Promise<HostSnapshot | undefined> {
    try {
      const res = await this.pool.query<{ data: string }>(
        "SELECT data FROM blackglass_baselines WHERE host_id = $1",
        [hostId],
      );
      if (res.rows.length === 0) return undefined;
      try {
        return (typeof res.rows[0].data === "string"
          ? JSON.parse(res.rows[0].data)
          : res.rows[0].data) as HostSnapshot;
      } catch (parseErr) {
        throw new StoreError("corrupt_record", `Baseline for ${hostId} failed to parse`, parseErr);
      }
    } catch (err) {
      if (err instanceof StoreError) throw err;
      console.error("[baseline-store/pg] Failed to get:", err);
      throw new StoreError("unavailable", "Postgres read failed", err);
    }
  }

  async listHostIds(): Promise<string[]> {
    try {
      const res = await this.pool.query<{ host_id: string }>(
        "SELECT host_id FROM blackglass_baselines ORDER BY collected_at DESC",
      );
      return res.rows.map((r) => r.host_id);
    } catch (err) {
      console.error("[baseline-store/pg] Failed to list:", err);
      throw new StoreError("unavailable", "Postgres list failed", err);
    }
  }

  async has(hostId: string): Promise<boolean> {
    try {
      const res = await this.pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM blackglass_baselines WHERE host_id = $1) AS exists",
        [hostId],
      );
      return res.rows[0]?.exists ?? false;
    } catch (err) {
      console.error("[baseline-store/pg] Failed to check existence:", err);
      return false;
    }
  }

  health(): BaselineStoreHealth {
    return { adapter: "postgres", configured: true, writable: null };
  }
}
