/**
 * DbSecretProvider — resolves SSH private keys from the `tenant_credentials` table.
 *
 * Activated when SECRET_PROVIDER=db.  Requires:
 *   - DATABASE_URL configured (tryGetDb() non-null)
 *   - ctx.tenantId set on every ScanContext
 *
 * ctx.credentialRef selects the credential:
 *   - A UUID string → looked up by `id`
 *   - A label string  → looked up by `label` (default: "default")
 *
 * RLS is enforced via withTenantRls so a misconfigured tenantId cannot leak
 * another tenant's key material.
 */

import { eq, and } from "drizzle-orm";
import { withTenantRls } from "@/db";
import { tenantCredentials } from "@/db/schema";
import { SecretFetchError } from "../errors";
import { createPrivateKeyScanCredential } from "../credential-factory";
import { normalizePrivateKeyPem } from "../pem";
import { maybeDecryptPem } from "../envelope";
import type { ScanContext, SecretProvider, ScanCredential } from "../types";

/** Loose UUID check — 8-4-4-4-12 hex groups. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class DbSecretProvider implements SecretProvider {
  async fetchScanCredential(ctx: ScanContext): Promise<ScanCredential> {
    if (!ctx.tenantId?.trim()) {
      throw new SecretFetchError(
        "DbSecretProvider requires tenantId in ScanContext. " +
          "Ensure the scan/baseline route passes access.ctx.tenant.id via CollectScanOptions.tenantId.",
      );
    }

    const ref = ctx.credentialRef?.trim() || "default";
    const isUuid = UUID_RE.test(ref);

    const rows = await withTenantRls(ctx.tenantId, async (db) => {
      if (isUuid) {
        return db
          .select()
          .from(tenantCredentials)
          .where(
            and(
              eq(tenantCredentials.id, ref),
              eq(tenantCredentials.tenantId, ctx.tenantId!),
            ),
          );
      }
      return db
        .select()
        .from(tenantCredentials)
        .where(
          and(
            eq(tenantCredentials.label, ref),
            eq(tenantCredentials.tenantId, ctx.tenantId!),
          ),
        );
    });

    const row = rows[0];
    if (!row) {
      throw new SecretFetchError(
        `Credential '${ref}' not found for tenant ${ctx.tenantId}. ` +
          "Add a row to tenant_credentials with this label/id before scanning.",
      );
    }

    const material = await maybeDecryptPem(row.encryptedKey);
    const normalized = normalizePrivateKeyPem(material.toString("utf8"));
    // Zero-fill the buffer on release to limit key material lifetime in RAM.
    return createPrivateKeyScanCredential(Buffer.from(normalized, "utf8"));
  }
}
