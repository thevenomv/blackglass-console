import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { logStructured } from "@/lib/server/log";

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
    // DO managed Postgres uses a self-signed CA. Strip sslmode from the URL
    // and pass ssl options explicitly so pg v8 doesn't treat sslmode=require
    // as verify-full (which causes SELF_SIGNED_CERT_IN_CHAIN).
    const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
    const sslOpts = url.includes("sslmode=") ? { ssl: { rejectUnauthorized: false } } : {};
    g[POOL_KEY] = new pg.Pool({ connectionString: cleanUrl, max: 8, ...sslOpts });
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
 * @internal — **Restricted to a small set of trusted server paths.**
 * Allowed callers:
 *   - Clerk/Stripe webhook handlers (`src/app/api/webhooks/`)
 *   - Tenant provisioning (`src/lib/saas/tenant-service.ts`)
 *   - Admin / maintenance scripts (`scripts/`)
 *   - Drizzle migrations
 *
 * All other app code **must** use `withTenantRls` to enforce per-tenant data isolation.
 * Sets `app.bypass_rls=1` so RLS policies allow cross-tenant writes for one transaction.
 * @see docs/migrations/007_saas_rls.sql
 */
export async function withBypassRls<T>(fn: (db: BlackglassDb) => Promise<T>): Promise<T> {
  // Emit a structured security event every time bypass mode is entered so that
  // unexpected callers are visible in production logs.
  const caller = new Error().stack?.split("\n")[2]?.trim() ?? "unknown";
  logStructured("warn", "rls_bypass_entered", { caller });
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
 *
 * This is the **only** way app code should read or write tenant-scoped data.
 * GUCs are scoped to the transaction and automatically reset when it completes,
 * which is safe under pgBouncer's transaction-mode pooling.
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
