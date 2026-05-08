/**
 * Per-tenant KMS / BYOK lookup layer (Phase 1: data model + flag only).
 *
 * Phase 1 (this file): expose `loadTenantKmsConfig(tenantId)` so the
 *   envelope-encryption layer and the operator UI can ask "does this
 *   tenant use a customer-supplied KMS key?". When BYOK_ENABLED is
 *   unset or `loadTenantKmsConfig()` returns null, behaviour is exactly
 *   the same as before — wrapping uses the global KMS_PROVIDER.
 *
 * Phase 2 (follow-up): teach `encryptKey` / `decryptKey` in envelope.ts
 *   to switch on the result of this lookup. Behind the same flag, so the
 *   data model can ship now without touching the hot path.
 *
 * Phase 3 (follow-up): expose a Settings → Identity → "Bring your own
 *   key" form that writes rows into `saas_tenant_kms_keys` and runs the
 *   round-trip verification.
 *
 * The split is deliberate — letting the schema and feature flag land
 * first means we can roll the actual encryption switch out per-tenant
 * without coordinating a chart upgrade or a fresh migration.
 */

import { withTenantRls, schema } from "@/db";
import { eq } from "drizzle-orm";

const { saasTenantKmsKeys } = schema;

export type TenantKmsConfig = {
  id: string;
  tenantId: string;
  provider: "awskms" | "vault";
  keyRef: string;
  /**
   * Only set when the deployment needs per-tenant credentials to talk
   * to the customer KMS. Still wrapped — caller must pass it through
   * the global envelope decrypt before use.
   */
  providerSecretEncrypted: string | null;
  enabled: boolean;
  lastVerifiedAt: Date | null;
  lastVerifyError: string | null;
};

/**
 * True when the BYOK code path may run. Defaults to off — the data model
 * ships ahead of the encryption switch so the table can exist on every
 * deployment without any behavioural change.
 */
export function byokEnabled(): boolean {
  const raw = process.env.BYOK_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Look up the tenant's BYOK config. Returns null when:
 *   - BYOK_ENABLED is not set,
 *   - the tenant has no row in saas_tenant_kms_keys,
 *   - the row exists but is `enabled = false`.
 *
 * RLS already scopes the read; we still pass tenantId explicitly so the
 * intent is obvious at every call site.
 */
export async function loadTenantKmsConfig(
  tenantId: string,
): Promise<TenantKmsConfig | null> {
  if (!byokEnabled()) return null;
  if (!tenantId) return null;

  return withTenantRls(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(saasTenantKmsKeys)
      .where(eq(saasTenantKmsKeys.tenantId, tenantId))
      .limit(1);
    const row = rows[0];
    if (!row || !row.enabled) return null;
    if (row.provider !== "awskms" && row.provider !== "vault") {
      // Defensive — the SQL CHECK constraint should make this unreachable.
      return null;
    }
    return {
      id: row.id,
      tenantId: row.tenantId,
      provider: row.provider,
      keyRef: row.keyRef,
      providerSecretEncrypted: row.providerSecretEncrypted,
      enabled: row.enabled,
      lastVerifiedAt: row.lastVerifiedAt,
      lastVerifyError: row.lastVerifyError,
    };
  });
}

/**
 * Compact summary used by the operator settings UI / health endpoints.
 * Never returns secret material.
 */
export type TenantKmsStatus = {
  byokEnabled: boolean;
  configured: boolean;
  provider: "awskms" | "vault" | null;
  keyRef: string | null;
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
};

export async function tenantKmsStatus(
  tenantId: string,
): Promise<TenantKmsStatus> {
  const flagOn = byokEnabled();
  const cfg = flagOn ? await loadTenantKmsConfig(tenantId) : null;
  return {
    byokEnabled: flagOn,
    configured: cfg !== null,
    provider: cfg?.provider ?? null,
    keyRef: cfg?.keyRef ?? null,
    lastVerifiedAt: cfg?.lastVerifiedAt?.toISOString() ?? null,
    lastVerifyError: cfg?.lastVerifyError ?? null,
  };
}
