import {
  boolean,
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
  "past_due",
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

/** Per-tenant SSH collector host registry. Each row represents one monitored host. */
export const saasCollectorHosts = pgTable(
  "saas_collector_hosts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    label: text("label"),
    sshUser: text("ssh_user").notNull().default("blackglass"),
    sshPort: integer("ssh_port").notNull().default(22),
    enabled: boolean("enabled").notNull().default(true),
    /** FK to tenant_credentials — when set, this host uses that key instead of the global env credential. */
    credentialId: uuid("credential_id").references(() => tenantCredentials.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantHostUq: uniqueIndex("saas_collector_hosts_tenant_hostname_uq").on(t.tenantId, t.hostname),
  }),
);

/** Per-tenant evidence bundles — tamper-evident audit packages for compliance. */
export const saasEvidenceBundles = pgTable("saas_evidence_bundles", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  scope: text("scope").notNull().default("all"), // "all" | hostId
  sha256: text("sha256").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  generatedBy: text("generated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SaasTenant = typeof saasTenants.$inferSelect;
export type SaasSubscription = typeof saasSubscriptions.$inferSelect;
export type SaasTenantMembership = typeof saasTenantMemberships.$inferSelect;
export type SaasCollectorHost = typeof saasCollectorHosts.$inferSelect;
export type SaasEvidenceBundle = typeof saasEvidenceBundles.$inferSelect;

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

// ── Sandboxes ─────────────────────────────────────────────────────────────────

/**
 * Ephemeral per-tenant sandbox Droplets provisioned by Blackglass.
 * Customers never receive SSH credentials — Blackglass manages the full
 * lifecycle (keypair, host registration, drift seeding, teardown).
 *
 * Lifecycle: provisioning → ready → (destroying → destroyed)
 *
 * - One active sandbox per tenant at a time (enforced by DB unique index on
 *   tenantId where status != 'destroyed').
 * - The matching saasCollectorHosts row is created on transition to 'ready'.
 * - ttlExpiresAt is set by the provisioner; a BullMQ job destroys when elapsed.
 */
export const sandboxStatusEnum = pgEnum("sandbox_status", [
  "provisioning",
  "ready",
  "seeding",
  "error",
  "destroying",
  "destroyed",
]);

export const saasSandboxes = pgTable(
  "saas_sandboxes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    /** DO Droplet integer ID, set once the Droplet API call returns. */
    dropletId: text("droplet_id"),
    /** Primary public IPv4 of the Droplet, set once the Droplet is active. */
    dropletIp: text("droplet_ip"),
    /** DO data-centre region (e.g. "lon1"). */
    region: text("region").notNull().default("lon1"),
    /** FK to saasCollectorHosts — set once the host is registered. */
    hostId: uuid("host_id").references(() => saasCollectorHosts.id, { onDelete: "set null" }),
    /** FK to tenantCredentials — sandbox-specific keypair. */
    credentialId: uuid("credential_id").references(() => tenantCredentials.id, {
      onDelete: "set null",
    }),
    status: sandboxStatusEnum("status").notNull().default("provisioning"),
    /** When set, the worker destroys the Droplet and marks status = 'destroyed'. */
    ttlExpiresAt: timestamp("ttl_expires_at", { withTimezone: true }),
    /** Stage index of the last drift scene applied (0 = baseline only). */
    seedPhase: integer("seed_phase").notNull().default(0),
    /** ISO timestamp of the last drift seeding run. */
    driftSeededAt: timestamp("drift_seeded_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantActiveSandboxUq: uniqueIndex("saas_sandboxes_tenant_active_uq").on(t.tenantId),
  }),
);

export type SaasSandbox = typeof saasSandboxes.$inferSelect;
