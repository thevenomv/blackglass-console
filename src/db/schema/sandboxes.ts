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
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { saasTenants } from "./saas";
import { saasCollectorHosts } from "./hosts";
import { tenantCredentials } from "./credentials";

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
