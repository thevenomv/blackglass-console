/**
 * Core SaaS schema: tenants, subscriptions, memberships, audit, security events,
 * webhook idempotency, and programmatic API keys.
 */
import {
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** App roles — persisted per tenant; never trust the client for authorization. */
export const tenantRoleEnum = pgEnum("tenant_role", [
  "owner",
  "admin",
  "operator",
  "viewer",
  "guest_auditor",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "trial_expired",
  "canceled",
  "custom",
]);

export const saasTenants = pgTable("saas_tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  /**
   * Charon policy JSON — tag filters, minimum idle score, optional scan digest email.
   * @see src/lib/janitor/charon-policies.ts
   */
  charonPolicies: jsonb("charon_policies").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const saasSubscriptions = pgTable("saas_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  planCode: text("plan_code").notNull(),
  status: subscriptionStatusEnum("status").notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
  hostLimit: integer("host_limit").notNull(),
  paidSeatLimit: integer("paid_seat_limit").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  features: jsonb("features").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const saasTenantMemberships = pgTable(
  "saas_tenant_memberships",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: tenantRoleEnum("role").notNull(),
    status: text("status").notNull().default("active"),
    invitedBy: text("invited_by"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.userId] }),
  }),
);

export const saasAuditEvents = pgTable("saas_audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const saasSecurityEvents = pgTable("saas_security_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  severity: text("severity").notNull(),
  eventType: text("event_type").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Cross-process webhook delivery deduplication (Stripe event.id, Clerk svix-id). */
export const saasWebhookIdempotency = pgTable(
  "saas_webhook_idempotency",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull(),
    eventKey: text("event_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sourceKeyUq: uniqueIndex("saas_webhook_idempotency_source_event_uq").on(t.source, t.eventKey),
  }),
);

/**
 * Long-lived API keys for programmatic / CI-CD access.
 * Only the SHA-256 hash of the raw key is stored here — the raw key is shown
 * once at creation time and never persisted.
 *
 * Key format: bg_live_<48 hex chars>
 * Auth: Authorization: Bearer <raw key>
 */
export const saasApiKeys = pgTable("saas_api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  /** SHA-256 hex of the raw key — never the raw key itself. */
  keyHash: text("key_hash").notNull().unique(),
  label: text("label").notNull(),
  /** Allowed scopes, e.g. ["scans.run", "drift.read"]. */
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  createdBy: text("created_by"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SaasTenant = typeof saasTenants.$inferSelect;
export type SaasSubscription = typeof saasSubscriptions.$inferSelect;
export type SaasTenantMembership = typeof saasTenantMemberships.$inferSelect;
export type SaasApiKey = typeof saasApiKeys.$inferSelect;
