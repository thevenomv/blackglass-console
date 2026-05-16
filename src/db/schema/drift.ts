/**
 * Drift mute/snooze rules and AI-generated remediation recommendations.
 */
import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { saasTenants } from "./saas";

/**
 * AI-generated remediation recommendations received from the
 * blackglass-remediator Python service.  Lifecycle:
 *
 *   draft → awaiting_approval → approved | rejected
 *
 * The remediator owns plan generation; BLACKGLASS owns approval state and
 * surfacing in the UI.  All approval mutations also POST back to the
 * remediator so it can drive any subsequent execution path (currently always
 * disabled; commands never auto-execute).
 */
export const remediationStatusEnum = pgEnum("remediation_status", [
  "draft",
  "awaiting_approval",
  "approved",
  "rejected",
  "expired",
]);

export const saasRemediations = pgTable("saas_remediations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  /** Remediator-issued ID (ULID) — used for callbacks / approve/reject. */
  remediationId: text("remediation_id").notNull().unique(),
  /** Originating drift event id for UI deep-linking (nullable when unknown). */
  driftEventId: text("drift_event_id"),
  hostId: text("host_id"),
  scanId: text("scan_id"),
  status: remediationStatusEnum("status").notNull().default("awaiting_approval"),
  riskPolicyTier: text("risk_policy_tier").notNull(),
  summary: text("summary").notNull(),
  /** Full plan JSON {commands, verification_steps, confidence_score, …}. */
  plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Per-tenant rules for hiding known-noisy drift findings without losing the
 * underlying data.  Each rule matches by category + a substring on the
 * finding title, optionally scoped to a host id.  When `mutedUntil` is null
 * the mute is permanent; otherwise it expires and the finding re-appears.
 *
 * The scan job applies mutes by setting `lifecycle = 'accepted_risk'` on
 * matching events instead of dropping them — auditors still see everything.
 */
export const saasDriftMutes = pgTable("saas_drift_mutes", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  /** Drift category enum value (matches DriftCategory in mock/types). */
  category: text("category").notNull(),
  /** Lower-cased substring matched against the event title. */
  titlePattern: text("title_pattern").notNull(),
  /** Optional collector host id — null means cross-host. */
  hostId: text("host_id"),
  /** Free-form reason captured at mute creation time. */
  reason: text("reason"),
  mutedUntil: timestamp("muted_until", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SaasRemediation = typeof saasRemediations.$inferSelect;
export type SaasDriftMute = typeof saasDriftMutes.$inferSelect;
