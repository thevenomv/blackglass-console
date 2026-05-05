import type { AuditEntry } from "@/lib/server/audit-log";
import type { Pool } from "pg";

const POOL_KEY = "__blackglass_audit_pg_pool_v1" as const;
type G = typeof globalThis & { [POOL_KEY]?: Pool };

/**
 * Fire-and-forget INSERT when **`AUDIT_DATABASE_URL`** or **`DATABASE_URL`** is set.
 * `AUDIT_DATABASE_URL` takes precedence; falls back to `DATABASE_URL` so operators
 * only need one env var when using a single Postgres instance.
 * Table DDL: **`docs/migrations/001_audit_events.sql`**
 */
export function appendAuditPostgres(entry: AuditEntry): void {
  const conn = (process.env.AUDIT_DATABASE_URL ?? process.env.DATABASE_URL)?.trim();
  if (!conn) return;

  void (async () => {
    try {
      const { Pool: PgPool } = await import("pg");
      const g = globalThis as G;
      if (!g[POOL_KEY]) {
        const cleanUrl = conn.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
        const sslOpts = conn.includes("sslmode=") ? { ssl: { rejectUnauthorized: false } } : {};
        g[POOL_KEY] = new PgPool({ connectionString: cleanUrl, max: 4, ...sslOpts });
      }
      const pool = g[POOL_KEY]!;
      await pool.query(
        `INSERT INTO blackglass_audit (id, ts, action, detail, actor, scan_id, request_id)
         VALUES ($1::uuid, $2::timestamptz, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          entry.id,
          entry.ts,
          entry.action,
          entry.detail,
          entry.actor ?? null,
          entry.scan_id ?? null,
          entry.request_id ?? null,
        ],
      );
    } catch (err) {
      console.error("[audit-log] Postgres append failed:", err);
    }
  })();
}
