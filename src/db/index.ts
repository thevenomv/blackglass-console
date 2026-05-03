import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const POOL_KEY = "__blackglass_drizzle_pool_v1" as const;
type G = typeof globalThis & { [POOL_KEY]?: pg.Pool };

export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || undefined;
}

export function createDb() {
  const url = databaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const g = globalThis as G;
  if (!g[POOL_KEY]) {
    g[POOL_KEY] = new pg.Pool({ connectionString: url, max: 8 });
  }
  return drizzle(g[POOL_KEY]!, { schema });
}

export function tryGetDb() {
  if (!databaseUrl()) return null;
  return createDb();
}

/** Lazy singleton for server runtime when DATABASE_URL is configured. */
export function getDb() {
  if (!databaseUrl()) {
    throw new Error("DATABASE_URL is not set");
  }
  return createDb();
}

/** Drizzle DB type (pool-backed). Transaction callbacks receive a compatible client. */
export type BlackglassDb = ReturnType<typeof createDb>;

/**
 * Trusted server paths only (Clerk/Stripe webhooks, tenant provisioning).
 * Sets Postgres GUCs for one transaction so RLS policies allow cross-tenant writes.
 * @see docs/migrations/007_saas_rls.sql
 */
export async function withBypassRls<T>(fn: (db: BlackglassDb) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.bypass_rls', '1', true)`);
    await tx.execute(sql`select set_config('app.tenant_id', '', true)`);
    return fn(tx as unknown as BlackglassDb);
  });
}

/**
 * Per-request tenant scope for RLS. Must match the authenticated workspace UUID
 * (`saas_tenants.id`), not the Clerk organization id.
 */
export async function withTenantRls<T>(
  tenantId: string,
  fn: (db: BlackglassDb) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.bypass_rls', '', true)`);
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as BlackglassDb);
  });
}

export { schema };
