/**
 * Charon — cloud resource janitor: linked accounts, findings, suppressions,
 * and operator-approved cleanup requests.
 */
import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { saasTenants } from "./saas";

/**
 * Linked cloud account for idle-resource scanning (read-only API token).
 * `encryptedApiKey` stores `JSON.stringify(EncryptedKey)` from envelope.ts.
 */
export const janitorAccounts = pgTable(
  "janitor_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    /** Provider slug: `do` (MVP), later `aws` | `gcp`. */
    provider: text("provider").notNull(),
    accountName: text("account_name").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    scopesVerified: jsonb("scopes_verified").$type<string[]>().notNull().default([]),
    lastScanAt: timestamp("last_scan_at", { withTimezone: true }),
    /** `ok` | `failed` — set by scan job; findings are only replaced after a successful scan. */
    lastScanStatus: text("last_scan_status"),
    /** Truncated provider/API error message when `last_scan_status` is `failed`. */
    lastScanError: text("last_scan_error"),
    /** Last successful scan inventory fingerprint (`CharonScanSnapshotV1` JSON). */
    lastScanSnapshot: jsonb("last_scan_snapshot").$type<unknown>(),
    /** Diff vs previous successful scan (`CharonScanDiffStored` JSON). */
    lastScanDiff: jsonb("last_scan_diff").$type<unknown>(),
    scanSchedule: text("scan_schedule").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantNameProviderUq: uniqueIndex("janitor_accounts_tenant_name_provider_uq").on(
      t.tenantId,
      t.accountName,
      t.provider,
    ),
  }),
);

export const janitorFindings = pgTable(
  "janitor_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => janitorAccounts.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    resourceName: text("resource_name").notNull(),
    idleScore: integer("idle_score").notNull(),
    estimatedWasteMonthly: numeric("estimated_waste_monthly", { precision: 12, scale: 2 }).notNull(),
    tags: jsonb("tags").$type<Record<string, string>>(),
    metricsMeta: jsonb("metrics_meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    accountResourceUq: uniqueIndex("janitor_findings_account_resource_uq").on(
      t.accountId,
      t.resourceType,
      t.resourceId,
    ),
  }),
);

/**
 * Operator suppressions — hide a resource from findings across rescans until snooze expires or row is removed.
 * `kind`: `dismiss` | `snooze`
 */
export const janitorResourceSuppressions = pgTable(
  "janitor_resource_suppressions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => janitorAccounts.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    kind: text("kind").notNull(),
    snoozeUntil: timestamp("snooze_until", { withTimezone: true }),
    note: text("note"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    accountResourceUq: uniqueIndex("janitor_resource_suppressions_account_res_uq").on(
      t.accountId,
      t.resourceType,
      t.resourceId,
    ),
  }),
);

/** HITL cleanup request — queue + approve/reject; live deletes for DO / AWS / GCP when entitled. */
export const janitorCleanupRequests = pgTable("janitor_cleanup_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  findingId: uuid("finding_id")
    .notNull()
    .references(() => janitorFindings.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  approvedByUserId: text("approved_by_user_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  mode: text("mode").notNull().default("dry_run"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type JanitorAccount = typeof janitorAccounts.$inferSelect;
export type JanitorFinding = typeof janitorFindings.$inferSelect;
export type JanitorResourceSuppression = typeof janitorResourceSuppressions.$inferSelect;
export type JanitorCleanupRequest = typeof janitorCleanupRequests.$inferSelect;
