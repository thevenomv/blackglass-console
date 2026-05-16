/**
 * Per-tenant SSH private key store — envelope-encrypted at rest via envelope.ts.
 *
 * Imported by both `hosts.ts` and `sandboxes.ts`; keeping it in its own module
 * avoids circular references between those two.
 */
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { saasTenants } from "./saas";

/**
 * Per-tenant SSH private key store — envelope-encrypted at rest via envelope.ts.
 * The `encryptedKey` column holds either:
 *   - A plain PEM string (legacy / KMS disabled)
 *   - A JSON EncryptedKey blob `{ ciphertext, iv, authTag, wrappedDek, kmsProvider }`
 *     produced by `encryptKey()` in src/lib/server/secrets/envelope.ts.
 *
 * Use `maybeDecryptPem(row.encryptedKey)` to transparently obtain the raw PEM buffer.
 */
export const tenantCredentials = pgTable(
  "tenant_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Plain PEM or JSON envelope-encrypted blob (see encryptKey / maybeDecryptPem). */
    encryptedKey: text("encrypted_key").notNull(),
    algorithm: text("algorithm").notNull().default("ed25519"),
    comment: text("comment"),
    /** SHA-256 fingerprint of the PUBLIC key for display (never the private key). */
    fingerprint: text("fingerprint"),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantLabelUq: uniqueIndex("tenant_credentials_tenant_label_uq").on(t.tenantId, t.label),
  }),
);

export type TenantCredential = typeof tenantCredentials.$inferSelect;
