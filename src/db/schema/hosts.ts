/**
 * Host inventory: collector hosts, tombstones, baseline capture jobs, host policies.
 */
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { saasTenants } from "./saas";
import { tenantCredentials } from "./credentials";

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

/**
 * Host tombstones — short-lived "do not re-bootstrap" markers written when
 * an operator deletes a host. The agent ingest path consults this table and
 * returns 410 Gone for tombstoned host_ids until `expiresAt` passes (or the
 * tombstone is explicitly cleared). Default TTL is HOST_TOMBSTONE_TTL_HOURS
 * (24h). See drizzle/0018_host_tombstones.sql for index/RLS DDL.
 */
export const saasHostTombstones = pgTable("saas_host_tombstones", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Null tenant_id is reserved for legacy single-tenant ingest. */
  tenantId: uuid("tenant_id").references(() => saasTenants.id, { onDelete: "cascade" }),
  hostId: text("host_id").notNull(),
  hostname: text("hostname"),
  deletedBy: text("deleted_by"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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

export type SaasCollectorHost = typeof saasCollectorHosts.$inferSelect;
export type SaasHostTombstone = typeof saasHostTombstones.$inferSelect;
export type SaasBaselineCaptureJob = typeof saasBaselineCaptureJobs.$inferSelect;
export type SaasHostPolicy = typeof saasHostPolicies.$inferSelect;
