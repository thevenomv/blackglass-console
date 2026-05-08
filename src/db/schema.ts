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

/** Async baseline capture job — see POST /api/v1/baselines (202) and capture-jobs GET. */
export const saasBaselineCaptureJobs = pgTable("saas_baseline_capture_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Null for legacy (non-Clerk) deployments; RLS allows access only in bypass mode. */
  tenantId: uuid("tenant_id").references(() => saasTenants.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  requestId: text("request_id"),
  result: jsonb("result").$type<Record<string, unknown> | null>(),
  errorDetail: text("error_detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type SaasTenant = typeof saasTenants.$inferSelect;
export type SaasSubscription = typeof saasSubscriptions.$inferSelect;
export type SaasTenantMembership = typeof saasTenantMemberships.$inferSelect;
export type SaasCollectorHost = typeof saasCollectorHosts.$inferSelect;
export type SaasEvidenceBundle = typeof saasEvidenceBundles.$inferSelect;
export type SaasBaselineCaptureJob = typeof saasBaselineCaptureJobs.$inferSelect;

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
    /** DO Cloud Firewall ID — set once the firewall is created; used for cleanup. */
    firewallId: text("firewall_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantActiveSandboxUq: uniqueIndex("saas_sandboxes_tenant_active_uq").on(t.tenantId),
  }),
);

export type SaasSandbox = typeof saasSandboxes.$inferSelect;

// ── API Keys ──────────────────────────────────────────────────────────────────

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

export type SaasApiKey = typeof saasApiKeys.$inferSelect;

// ── Host Policies ─────────────────────────────────────────────────────────────

/**
 * "Must stay true" invariant rules per tenant.
 * Each rule asserts that a specific key-path in the HostSnapshot must equal
 * an expected value.  Violations surface as policy_violation drift events.
 *
 * conditionKey: dot-delimited path into HostSnapshot (e.g. "sshConfig.permitRootLogin")
 * conditionValue: expected string value (e.g. "no")
 */
export const saasHostPolicies = pgTable("saas_host_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  conditionKey: text("condition_key").notNull(),
  conditionValue: text("condition_value").notNull(),
  severity: text("severity").notNull().default("high"),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SaasHostPolicy = typeof saasHostPolicies.$inferSelect;

// ── Tenant notification settings ──────────────────────────────────────────────

/**
 * Per-tenant notification routing for drift alerts.  Single row per tenant
 * (enforced by the FK uniqueness on tenant_id).  Each column holds a
 * destination override; when null the env-var default is used.
 *
 * Use saas/notifications-service.ts to read this in code paths that previously
 * read process.env.{ALERT_EMAIL_TO,WEBHOOK_URLS,SLACK_ALERT_WEBHOOK_URL,PD_ROUTING_KEY}.
 */
export const saasTenantNotifications = pgTable("saas_tenant_notifications", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  /** Comma-separated list of email addresses to alert on high-severity drift. */
  alertEmailTo: text("alert_email_to"),
  /** Comma-separated list of HTTP(S) outbound webhook destinations. */
  webhookUrls: text("webhook_urls"),
  /** Single Slack incoming-webhook URL for fleet-wide drift summaries. */
  slackWebhookUrl: text("slack_webhook_url"),
  /** PagerDuty Events v2 integration routing key. */
  pdRoutingKey: text("pd_routing_key"),
  /**
   * Active webhook HMAC signing key for this tenant.  When non-null this is
   * used in preference to the WEBHOOK_SECRET env var; per-tenant keys mean
   * one tenant's leaked key can't forge another tenant's payloads.
   */
  webhookSigningKey: text("webhook_signing_key"),
  /**
   * Previous signing key — kept valid during the rotation overlap window
   * (default 24h, overridable via ROTATION_OVERLAP_HOURS).  The dispatcher
   * emits both `X-Blackglass-Signature` (current) and
   * `X-Blackglass-Signature-Previous` (previous) headers while populated so
   * receivers can verify against either without a hard cutover.
   */
  webhookSigningKeyPrevious: text("webhook_signing_key_previous"),
  /**
   * Wall-clock time of the last rotation.  When `now() - rotated_at` exceeds
   * the overlap window the previous key is considered retired and the
   * `-Previous` header stops being emitted.
   */
  webhookSigningKeyRotatedAt: timestamp("webhook_signing_key_rotated_at", { withTimezone: true }),
  /**
   * Per-tenant override for the scheduled drift-events digest cadence.
   * Null = inherit the deployment-wide default (DRIFT_DIGEST_INTERVAL).
   * Allowed values: 'off' | 'daily' | 'weekly' (enforced by SQL CHECK
   * `saas_tenant_notifications_digest_cadence_chk`).
   */
  driftDigestCadence: text("drift_digest_cadence"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SaasTenantNotifications = typeof saasTenantNotifications.$inferSelect;

// ── Per-tenant KMS / BYOK ────────────────────────────────────────────────────

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

// ── Remediation recommendations (from blackglass-remediator) ──────────────────

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

export type SaasRemediation = typeof saasRemediations.$inferSelect;

// ── Drift mute / snooze patterns ──────────────────────────────────────────────

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

export type SaasDriftMute = typeof saasDriftMutes.$inferSelect;

// ── Per-tenant data retention policies ────────────────────────────────────────

/**
 * Tenant-controlled retention windows for the long-tail telemetry tables.
 *
 * A nightly worker job (`retention-cleanup-worker.ts`) walks every tenant
 * with a row here and deletes records older than the configured number of
 * days for each data class.  When no row exists, the deployment-wide
 * fallback is used (the historic behaviour — keep everything).
 *
 * Setting any column to NULL or 0 disables retention for that data class;
 * keep-forever wins over the global default.
 */
export const saasRetentionPolicies = pgTable("saas_retention_policies", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  /** Days to keep `blackglass_drift_events` rows. */
  driftEventsDays: integer("drift_events_days"),
  /** Days to keep `blackglass_baselines` snapshots beyond the most recent per host. */
  baselineSnapshotsDays: integer("baseline_snapshots_days"),
  /** Days to keep `saas_audit_events` rows. */
  auditEventsDays: integer("audit_events_days"),
  /** Days to keep `saas_evidence_bundles` rows + their underlying objects. */
  evidenceBundlesDays: integer("evidence_bundles_days"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SaasRetentionPolicy = typeof saasRetentionPolicies.$inferSelect;

// ── Per-tenant data export jobs (GDPR / portability) ──────────────────────────

export const dataExportStatusEnum = pgEnum("data_export_status", [
  "queued",
  "running",
  "ready",
  "failed",
  "expired",
]);

/**
 * Tenant-initiated data export jobs.
 *
 * Each job ZIPs the tenant's evidence + drift + audit + host inventory,
 * uploads to Spaces under a temporary key, and emails the requester a
 * signed, expiring download URL.  Rows are kept for `expiresAt` so the
 * UI can show recent exports without surfacing stale download links.
 */
export const saasDataExports = pgTable("saas_data_exports", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => saasTenants.id, { onDelete: "cascade" }),
  status: dataExportStatusEnum("status").notNull().default("queued"),
  requestedBy: text("requested_by"),
  /** Optional override email — defaults to the requester's primary email. */
  deliverTo: text("deliver_to"),
  /** Spaces object key once the bundle has uploaded. */
  objectKey: text("object_key"),
  /** Bytes — for the UI to show "12.4 MB" without re-fetching. */
  sizeBytes: integer("size_bytes"),
  errorMessage: text("error_message"),
  /** Set when `status='ready'` — when the signed URL stops working. */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SaasDataExport = typeof saasDataExports.$inferSelect;

// ── Per-tenant CIS evidence-of-control mapping ────────────────────────────────

/**
 * Maps a tenant's CIS Controls / CIS Benchmarks IDs to drift categories that
 * provide ongoing evidence the control is enforced.  Used to render the
 * "Controls" tab on the Evidence page so auditors can see which control IDs
 * each tenant is actively monitoring and where to find the supporting drift
 * stream.
 *
 * Multiple drift categories can satisfy a single control; multiple controls
 * can be satisfied by the same category.  The lifecycle column lets the
 * tenant mark a control as `not_applicable` (with a reason) without losing
 * the row.
 */
export const cisMappingStatusEnum = pgEnum("cis_mapping_status", [
  "active",
  "not_applicable",
  "draft",
]);

export const saasCisMappings = pgTable(
  "saas_cis_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => saasTenants.id, { onDelete: "cascade" }),
    /** CIS Control / Sub-Control identifier, e.g. "CIS-4.1" or "CIS-Linux-5.2.4". */
    controlId: text("control_id").notNull(),
    /** Display title cached at mapping time so the UI doesn't need a static dictionary. */
    controlTitle: text("control_title").notNull(),
    /** Drift category that provides ongoing evidence (matches DriftCategory). */
    driftCategory: text("drift_category").notNull(),
    status: cisMappingStatusEnum("status").notNull().default("active"),
    /** Free-form rationale — required when status='not_applicable'. */
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantControlCategoryUq: uniqueIndex("saas_cis_mappings_tenant_control_cat_uq").on(
      t.tenantId,
      t.controlId,
      t.driftCategory,
    ),
  }),
);

export type SaasCisMapping = typeof saasCisMappings.$inferSelect;
