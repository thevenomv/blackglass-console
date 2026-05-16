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
 * Sentinel UUID for `app.tenant_id` in bypass mode.
 *
 * Why not `''`? PostgreSQL's RLS policies cast the GUC to uuid via
 * `current_setting('app.tenant_id', TRUE)::uuid`. The empty string
 * is not a valid uuid, so the cast errors during planning even when
 * the OR-clause `app.bypass_rls = '1'` would have short-circuited
 * at runtime. With `''` set, every bypass-mode write fails as soon
 * as the connecting role is not the table owner / not BYPASSRLS —
 * which is exactly what production is supposed to look like.
 *
 * The all-zero UUID is unambiguously NOT a real tenant id (we
 * generate tenants via gen_random_uuid()), so picking it up in a
 * comparison is benign.
 */
const BYPASS_SENTINEL_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Run a transaction with PostgreSQL RLS bypass enabled. **Restricted to a
 * small set of trusted server paths.**
 *
 * Allowed callers (the only legitimate reasons to bypass RLS):
 *   - Inbound webhook handlers that look up a tenant by an external id
 *     (Stripe customer / subscription, Clerk org, Slack action) — they have
 *     no session yet, so they can't use `withTenantRls`.
 *   - Tenant lifecycle (provisioning, deletion, membership reconciliation).
 *   - Cross-tenant maintenance jobs that explicitly carry their own tenant
 *     scope in the job payload (retention sweep, partition health, drift
 *     digest fan-out, sandbox lifecycle, baseline-capture finalisation).
 *   - Admin / showcase routes scoped to operators (never authenticated
 *     tenant CRUD).
 *
 * All other app code **must** use `withTenantRls` to enforce per-tenant data
 * isolation. Sets `app.bypass_rls=1` so RLS policies short-circuit for one
 * transaction; the function emits a structured `rls_bypass_entered` log on
 * every entry so unexpected callers are visible in production.
 *
 * **RLS-BYPASS convention** — every call to this function MUST be preceded
 * by a single-line comment of the form:
 *
 *     // RLS-BYPASS: <one-line reason>
 *     await withBypassRls(async (db) => { ... });
 *
 * The `RLS-BYPASS:` prefix is the greppable tag reviewers use to enumerate
 * every cross-tenant code path in a single search. Adding a `withBypassRls`
 * call without the tag is a review-blocker. CI enforces a 1:1 tag/call count via
 * `npm run check:rls-bypass` (scripts/build/check-rls-bypass-tags.mjs).
 *
 * @see drizzle/0016_consolidate_rls_gucs.sql for the canonical RLS policy set
 * @see docs/security/security-compliance.md § 3 for the operator-facing RLS story
 * @see canvases/project-overview.canvas.tsx (§2 / §13 reviewer workflow — Cursor canvas)
 */
export async function withBypassRls<T>(fn: (db: BlackglassDb) => Promise<T>): Promise<T> {
  // Emit a structured security event every time bypass mode is entered so that
  // unexpected callers are visible in production logs.
  const caller = new Error().stack?.split("\n")[2]?.trim() ?? "unknown";
  logStructured("warn", "rls_bypass_entered", { caller });
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.bypass_rls', '1', true)`);
    // Set the sentinel UUID rather than '' so policies that cast the
    // GUC to uuid don't fail their planner-time evaluation. The
    // bypass_rls flag above is still what makes the policy's USING
    // clause evaluate true; the tenant_id value here just has to be
    // a syntactically-valid uuid that isn't a real tenant.
    await tx.execute(sql`select set_config('app.tenant_id', ${BYPASS_SENTINEL_TENANT_UUID}, true)`);
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
