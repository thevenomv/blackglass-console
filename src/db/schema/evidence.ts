/**
 * Evidence bundles, tenant data exports, and CIS control mappings.
 */
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { saasTenants } from "./saas";

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

export const cisMappingStatusEnum = pgEnum("cis_mapping_status", [
  "active",
  "not_applicable",
  "draft",
]);

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

export type SaasEvidenceBundle = typeof saasEvidenceBundles.$inferSelect;
export type SaasDataExport = typeof saasDataExports.$inferSelect;
export type SaasCisMapping = typeof saasCisMappings.$inferSelect;
