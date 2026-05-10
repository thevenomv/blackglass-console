/**
 * API key authentication for CI/CD and programmatic access.
 *
 * Keys have the format: bg_live_<48 random hex chars>
 * Only the SHA-256 hash is stored in Postgres (saas_api_keys table).
 *
 * Usage:
 *   const ctx = await resolveApiKey(request);
 *   if (!ctx) return 401;
 *   // ctx.tenantId, ctx.scopes, ctx.label are available
 */

import { createHash, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

export const API_KEY_PREFIX = "bg_live_";

export interface GeneratedApiKey {
  /** The raw key — shown once to the user, never stored. */
  raw: string;
  /** SHA-256 of the raw key — stored in the DB. */
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const raw = API_KEY_PREFIX + randomBytes(24).toString("hex"); // 48 hex chars = 192 bits of entropy
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface ApiKeyContext {
  tenantId: string;
  keyId: string;
  scopes: string[];
  label: string;
}

/**
 * Resolves a raw Bearer token to an ApiKeyContext.
 * Returns null if the key is not found, expired, or the DB is unavailable.
 *
 * The lastUsedAt write is awaited so the timestamp survives a cold-start
 * crash that occurs immediately after the auth check (P1a #20).
 */
export async function resolveApiKey(bearerToken: string): Promise<ApiKeyContext | null> {
  if (!bearerToken.startsWith(API_KEY_PREFIX)) return null;
  const hash = hashApiKey(bearerToken);

  const { tryGetDb, withBypassRls, schema: s } = await import("@/db");
  const db = tryGetDb();
  if (!db) return null;

  const { eq } = await import("drizzle-orm");

  // RLS-BYPASS: API key resolution happens BEFORE the request has any
  // tenant identity (the row is what determines the tenantId). Lookup is
  // by SHA-256 hash of the bearer token; rows are not joinable by tenant
  // until after this read returns.
  const rows = await withBypassRls((bdb) =>
    bdb
      .select({
        id: s.saasApiKeys.id,
        tenantId: s.saasApiKeys.tenantId,
        scopes: s.saasApiKeys.scopes,
        label: s.saasApiKeys.label,
        expiresAt: s.saasApiKeys.expiresAt,
      })
      .from(s.saasApiKeys)
      .where(eq(s.saasApiKeys.keyHash, hash))
      .limit(1),
  );

  const row = rows[0];
  if (!row) return null;

  if (row.expiresAt && row.expiresAt < new Date()) return null;

  try {
    // RLS-BYPASS: bookkeeping write keyed by the API key id we just resolved
    // above; no per-request tenant context yet.
    await withBypassRls((bdb) =>
      bdb
        .update(s.saasApiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(s.saasApiKeys.id, row.id)),
    );
  } catch (err) {
    // Don't fail the request if the bookkeeping write is briefly unavailable;
    // log so chronic failures are visible.
    console.warn("[api-key-auth] lastUsedAt write failed:", err);
  }

  return {
    tenantId: row.tenantId,
    keyId: row.id,
    scopes: (row.scopes as string[]) ?? [],
    label: row.label,
  };
}

/**
 * Extract a Bearer token from an Authorization header.
 * Returns null if missing or malformed.
 */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/**
 * Returns true if the API key context has the requested scope.
 * Wildcard scopes ("*") grant everything; exact-match otherwise.
 */
export function hasScope(ctx: ApiKeyContext, requiredScope: string): boolean {
  if (ctx.scopes.includes("*")) return true;
  return ctx.scopes.includes(requiredScope);
}
