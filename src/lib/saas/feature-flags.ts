import { tryGetDb, withTenantRls, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * Feature flags: env wins (FEATURE_FLAG_<KEY>=true|false), optional Postgres row
 * `saas_subscriptions.features` JSON key `flags.<name>` for Clerk tenants when DB is up.
 *
 * This is intentionally small — grow to a dedicated table or provider when you need history/UI.
 */
export async function resolveFeatureFlag(
  name: string,
  subscriptionFeatures?: Record<string, unknown> | null,
): Promise<boolean> {
  const envKey = `FEATURE_FLAG_${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const raw = process.env[envKey]?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;

  const nested = subscriptionFeatures?.flags;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const v = (nested as Record<string, unknown>)[name];
    if (v === true) return true;
    if (v === false) return false;
  }

  return false;
}

/** Read only `features.flags` for a tenant when you already have tenantId. */
export async function loadTenantFeatureFlags(
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  if (!tryGetDb()) return null;
  const rows = await withTenantRls(tenantId, async (db) =>
    db
      .select({ features: schema.saasSubscriptions.features })
      .from(schema.saasSubscriptions)
      .where(eq(schema.saasSubscriptions.tenantId, tenantId))
      .limit(1),
  );
  const f = rows[0]?.features;
  return f && typeof f === "object" ? f : null;
}
