/**
 * Per-tenant KMS / BYOK overrides for envelope encryption.
 */
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { saasTenants } from "./saas";

/**
 * Optional override of the global KMS provider for a single tenant.
 *
 * When present (and BYOK_ENABLED=true at runtime), the envelope-encryption
 * code uses the customer's own KMS key for wrapping/unwrapping data
 * encryption keys, so plaintext SSH keys (etc.) never sit under the
 * deployment's master KEK.
 *
 * `providerSecretEncrypted` is itself wrapped by the *global* KMS so
 * provider creds (Vault token, AWS role payload, …) are never plaintext
 * at rest. May be null when the deployment can authenticate to the
 * customer KMS via ambient creds (IAM instance profile, Workload
 * Identity, …).
 *
 * See drizzle/0014_tenant_kms_keys.sql.
 */
export const saasTenantKmsKeys = pgTable("saas_tenant_kms_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  /** 'awskms' | 'vault' — `local` is intentionally not allowed for BYOK. */
  provider: text("provider").notNull(),
  /** AWS KMS key ARN/ID for awskms; Transit key name for vault. */
  keyRef: text("key_ref").notNull(),
  /** Envelope-encrypted (by GLOBAL KMS) provider creds blob, or null. */
  providerSecretEncrypted: text("provider_secret_encrypted"),
  enabled: boolean("enabled").notNull().default(true),
  /** Last successful round-trip encrypt+decrypt against the customer KEK. */
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  /** Verbatim error from the most recent failed verification, if any. */
  lastVerifyError: text("last_verify_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SaasTenantKmsKey = typeof saasTenantKmsKeys.$inferSelect;
