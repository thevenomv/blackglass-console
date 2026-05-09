/**
 * Host tombstones — short-lived "do not re-bootstrap" markers.
 *
 * When an operator deletes a host via DELETE /api/v1/hosts/:id, we write
 * a tombstone here. The agent ingest path consults `isHostTombstoned()`
 * before bootstrapping a fresh baseline, so a still-running push-agent
 * on the deleted host doesn't silently resurrect the host inside the
 * 5-minute timer cycle.
 *
 * Storage:
 *   - When `DATABASE_URL` is set (production / SaaS): rows live in
 *     `saas_host_tombstones`, scoped by tenant_id (or NULL for the
 *     legacy single-tenant deployment).
 *   - When no DB: in-memory only. That's fine for local dev and the
 *     legacy single-process binary — there's no second process that
 *     could race the tombstone in those modes.
 *
 * TTL is configurable via `HOST_TOMBSTONE_TTL_HOURS` (default 24h).
 * Operators who want to allow re-registration before the TTL expires
 * call `clearTombstone()` (surfaced from the host detail UI as a
 * "Re-allow this host" action — wired in a follow-up PR; for now the
 * route is internal).
 */

import type { Pool } from "pg";

const POOL_KEY = "__blackglass_host_tombstones_pg_pool_v1" as const;
type G = typeof globalThis & {
  [POOL_KEY]?: Pool;
  __blackglass_host_tombstones_mem?: Map<string, { expiresAt: number; hostname: string | null; deletedBy: string | null }>;
};

function memStore(): Map<string, { expiresAt: number; hostname: string | null; deletedBy: string | null }> {
  const g = globalThis as G;
  if (!g.__blackglass_host_tombstones_mem) g.__blackglass_host_tombstones_mem = new Map();
  return g.__blackglass_host_tombstones_mem;
}

/** `null` tenant slot for the single-tenant / legacy ingest path. */
const NULL_TENANT_KEY = "__null__" as const;
function memKey(hostId: string, tenantId: string | null): string {
  return `${tenantId ?? NULL_TENANT_KEY}::${hostId}`;
}

export function getTombstoneTtlHours(): number {
  const raw = process.env.HOST_TOMBSTONE_TTL_HOURS;
  if (!raw) return 24;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 24;
  // Cap at 1 year — anything longer is a "delete and never re-allow"
  // signal and should be a different mechanism (allowlist policy).
  return Math.min(n, 24 * 365);
}

async function getPool(): Promise<Pool | null> {
  const conn = process.env.DATABASE_URL?.trim();
  if (!conn) return null;
  const g = globalThis as G;
  if (!g[POOL_KEY]) {
    const { Pool: PgPool } = await import("pg");
    const cleanUrl = conn.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
    const sslOpts = conn.includes("sslmode=") ? { ssl: { rejectUnauthorized: false } } : {};
    g[POOL_KEY] = new PgPool({ connectionString: cleanUrl, max: 2, ...sslOpts });
  }
  return g[POOL_KEY]!;
}

export type TombstoneInfo = {
  hostId: string;
  tenantId: string | null;
  hostname: string | null;
  deletedBy: string | null;
  expiresAt: string;
};

/**
 * Insert (or refresh) a tombstone for `hostId`. Idempotent: a second
 * delete just extends the TTL window. Resolves silently if Postgres is
 * unreachable (we don't want to block a delete cascade on tombstone
 * write failure — the cascade itself is the source of truth, the
 * tombstone is only a guard against immediate resurrection).
 */
export async function createTombstone(args: {
  hostId: string;
  tenantId: string | null;
  hostname: string | null;
  deletedBy: string | null;
}): Promise<TombstoneInfo> {
  const ttlMs = getTombstoneTtlHours() * 60 * 60 * 1000;
  const expires = new Date(Date.now() + ttlMs);

  // In-memory mirror (always written, used by the legacy / no-DB path
  // and as a fast-path read for the DB path within the same process).
  memStore().set(memKey(args.hostId, args.tenantId), {
    expiresAt: expires.getTime(),
    hostname: args.hostname,
    deletedBy: args.deletedBy,
  });

  const pool = await getPool();
  if (pool) {
    // We don't ON CONFLICT — partial unique indexes against a NULL-able
    // tenant_id are awkward, and a host can perfectly well have stacked
    // expired tombstones in history. Instead: delete any live tombstone
    // for this (tenant, host) pair, then insert the fresh one in a
    // single transaction so isHostTombstoned never sees a gap window.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM saas_host_tombstones
          WHERE host_id = $1
            AND COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
            AND expires_at > now()`,
        [args.hostId, args.tenantId],
      );
      await client.query(
        `INSERT INTO saas_host_tombstones (tenant_id, host_id, hostname, deleted_by, expires_at)
         VALUES ($1::uuid, $2, $3, $4, $5::timestamptz)`,
        [args.tenantId, args.hostId, args.hostname, args.deletedBy, expires.toISOString()],
      );
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* noop */
      }
      // Best-effort: log and proceed. The in-memory mirror still guards
      // the same process; cross-process replay of the deleted host will
      // re-bootstrap, which is unfortunate but not a security issue.
      console.error("[host-tombstones] Postgres upsert failed:", err);
    } finally {
      client.release();
    }
  }

  return {
    hostId: args.hostId,
    tenantId: args.tenantId,
    hostname: args.hostname,
    deletedBy: args.deletedBy,
    expiresAt: expires.toISOString(),
  };
}

/**
 * Returns the tombstone if `hostId` is currently tombstoned for the
 * given tenant scope. Resolves to `null` when the host is free to
 * re-bootstrap.
 *
 * Hot path — called on every agent push. We check the in-memory mirror
 * first (zero RTT) and only fall through to Postgres when there's a
 * connection pool available AND the in-memory miss happened. This
 * keeps single-replica deployments at sub-millisecond overhead while
 * giving multi-replica deployments correct behaviour after a tombstone
 * was written from a sibling replica.
 */
export async function isHostTombstoned(
  hostId: string,
  tenantId: string | null,
): Promise<TombstoneInfo | null> {
  const now = Date.now();
  const memHit = memStore().get(memKey(hostId, tenantId));
  if (memHit && memHit.expiresAt > now) {
    return {
      hostId,
      tenantId,
      hostname: memHit.hostname,
      deletedBy: memHit.deletedBy,
      expiresAt: new Date(memHit.expiresAt).toISOString(),
    };
  }
  if (memHit) {
    // Expired in memory — drop it so the cache stays small.
    memStore().delete(memKey(hostId, tenantId));
  }

  const pool = await getPool();
  if (!pool) return null;

  try {
    const res = await pool.query<{
      hostname: string | null;
      deleted_by: string | null;
      expires_at: Date;
    }>(
      `SELECT hostname, deleted_by, expires_at
         FROM saas_host_tombstones
        WHERE host_id = $1
          AND COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          AND expires_at > now()
        ORDER BY expires_at DESC
        LIMIT 1`,
      [hostId, tenantId],
    );
    const row = res.rows[0];
    if (!row) return null;
    // Backfill mem mirror so the next call in this process is free.
    memStore().set(memKey(hostId, tenantId), {
      expiresAt: row.expires_at.getTime(),
      hostname: row.hostname,
      deletedBy: row.deleted_by,
    });
    return {
      hostId,
      tenantId,
      hostname: row.hostname,
      deletedBy: row.deleted_by,
      expiresAt: row.expires_at.toISOString(),
    };
  } catch (err) {
    console.error("[host-tombstones] Postgres lookup failed:", err);
    // Fail-open: a DB outage shouldn't permanently block agent pushes.
    // The cost of a momentary resurrection is much smaller than the
    // cost of refusing all ingest while Postgres reboots.
    return null;
  }
}

/**
 * Drop the tombstone for `hostId`, allowing re-bootstrap on the next
 * agent push. Idempotent (returns false if there was nothing to clear).
 */
export async function clearTombstone(
  hostId: string,
  tenantId: string | null,
): Promise<boolean> {
  const memRemoved = memStore().delete(memKey(hostId, tenantId));
  let pgRemoved = false;
  const pool = await getPool();
  if (pool) {
    try {
      const res = await pool.query(
        `DELETE FROM saas_host_tombstones
          WHERE host_id = $1
            AND COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
        [hostId, tenantId],
      );
      pgRemoved = (res.rowCount ?? 0) > 0;
    } catch (err) {
      console.error("[host-tombstones] Postgres clear failed:", err);
    }
  }
  return memRemoved || pgRemoved;
}

/** Test/admin helper — wipe all in-memory tombstones (Postgres untouched). */
export function _resetMemTombstonesForTest(): void {
  memStore().clear();
}
