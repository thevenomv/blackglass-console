import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
  "trial_expired",
  "canceled",
  "custom",
]);

export const saasTenants = pgTable("saas_tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
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

export type SaasTenant = typeof saasTenants.$inferSelect;
export type SaasSubscription = typeof saasSubscriptions.$inferSelect;
export type SaasTenantMembership = typeof saasTenantMemberships.$inferSelect;
