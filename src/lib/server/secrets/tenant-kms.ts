/**
 * Per-tenant KMS / BYOK control plane.
 *
 * Phase 1 (shipped): data model + feature flag (`BYOK_ENABLED`) +
 *   `loadTenantKmsConfig(tenantId)` lookup. Behaviour gated off by
 *   default so the schema can exist on every deployment without
 *   touching the encryption hot path.
 *
 * Phase 2 (this file + envelope.ts): `encryptKey` / `decryptKey`
 *   honour the per-tenant override when present, persisting the
 *   tenant id on the `EncryptedKey` blob so decrypt routes back to
 *   the correct customer KEK. `verifyTenantKms()` performs a
 *   round-trip encrypt+decrypt against a known plaintext and updates
 *   `last_verified_at` / `last_verify_error`.
 *
 * Phase 3 (this file + ByokSection.tsx): `upsertTenantKmsConfig` /
 *   `disableTenantKmsConfig` plus the matching API surface so an admin
 *   can wire BYOK for their tenant from the Settings UI.
 */

import { withTenantRls, schema } from "@/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

// withBypassRls intentionally unused: verifyTenantKms operates under the
// caller's tenant RLS context (an admin acting on their own tenant). If
// we ever add a worker-driven re-verification job we'll switch to
// withBypassRls there to avoid plumbing a request-scoped tenant id.

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

// ─── Phase 3: provisioning + verification ────────────────────────────────────

/**
 * Upsert the tenant's BYOK config. Does NOT verify — call
 * `verifyTenantKms(tenantId)` immediately after to attempt a round-trip
 * and persist the result on `last_verified_at` / `last_verify_error`.
 */
export async function upsertTenantKmsConfig(
  tenantId: string,
  patch: { provider: "awskms" | "vault"; keyRef: string },
): Promise<void> {
  if (!byokEnabled()) {
    throw new Error("BYOK_ENABLED is not set on this deployment.");
  }
  if (patch.provider !== "awskms" && patch.provider !== "vault") {
    throw new Error(`Unsupported BYOK provider: ${patch.provider}`);
  }
  const keyRef = patch.keyRef.trim();
  if (!keyRef) throw new Error("keyRef is required");

  await withTenantRls(tenantId, async (tx) => {
    await tx
      .insert(saasTenantKmsKeys)
      .values({
        tenantId,
        provider: patch.provider,
        keyRef,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: saasTenantKmsKeys.tenantId,
        set: {
          provider: patch.provider,
          keyRef,
          enabled: true,
          // Clear prior verification when the keyRef changes — operator
          // must run verify again before the row's "verified" badge
          // turns green.
          lastVerifiedAt: null,
          lastVerifyError: null,
          updatedAt: new Date(),
        },
      });
  });
}

/**
 * Disable the tenant's BYOK config. Existing `EncryptedKey` blobs that
 * were wrapped while BYOK was active will FAIL to decrypt afterwards
 * (by design — see envelope.ts). The row is kept (`enabled = false`)
 * rather than deleted so the keyRef history is retained for audit.
 */
export async function disableTenantKmsConfig(tenantId: string): Promise<void> {
  await withTenantRls(tenantId, async (tx) => {
    await tx
      .update(saasTenantKmsKeys)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(saasTenantKmsKeys.tenantId, tenantId));
  });
}

/** Result of a BYOK round-trip verification. */
export type TenantKmsVerifyResult =
  | { ok: true; verifiedAt: string }
  | { ok: false; error: string };

/**
 * Round-trip a known plaintext through the tenant's KEK to confirm
 * BLACKGLASS can both wrap and unwrap with it. Persists the outcome on
 * the row so the Settings UI can surface "Verified ✓ 2 minutes ago" or
 * "FAILED — InvalidCiphertextException".
 *
 * Implementation note: we deliberately use `encryptKey` / `decryptKey`
 * (the same code path the SSH-key store will use) instead of poking
 * the KMS directly. That way the test exercises the EXACT path
 * production uses, including envelope construction, blob format, and
 * the tenantId routing logic in decryptKey.
 */
export async function verifyTenantKms(
  tenantId: string,
): Promise<TenantKmsVerifyResult> {
  // Lazy import to avoid a circular dep at module-init time.
  const { encryptKey, decryptKey } = await import("./envelope");
  // 32 bytes of CSPRNG output — large enough that an accidental
  // collision with stored credential bytes is statistically impossible.
  const probe = randomBytes(32);

  let result: TenantKmsVerifyResult;
  try {
    const blob = await encryptKey(tenantId, probe);
    if (!blob.tenantId) {
      throw new Error(
        "encryptKey did not route through the tenant KEK — check BYOK_ENABLED " +
          "and that the saas_tenant_kms_keys row is enabled.",
      );
    }
    const out = await decryptKey(tenantId, blob);
    if (Buffer.compare(out, probe) !== 0) {
      throw new Error("Round-trip plaintext mismatch — KMS returned a different blob.");
    }
    result = { ok: true, verifiedAt: new Date().toISOString() };
  } catch (err) {
    result = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    probe.fill(0);
  }

  // Persist the outcome regardless of success. Bypass RLS here because
  // verify is sometimes triggered by an admin background job that
  // doesn't have a per-request tenant context.
  await withTenantRls(tenantId, async (tx) => {
    await tx
      .update(saasTenantKmsKeys)
      .set({
        lastVerifiedAt: result.ok ? new Date(result.verifiedAt) : null,
        lastVerifyError: result.ok ? null : result.error.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(eq(saasTenantKmsKeys.tenantId, tenantId));
  });

  return result;
}
