/**
 * Evidence bundle service.
 *
 * Generates tamper-evident audit packages by reading real baseline snapshots
 * and drift events from the existing PostgreSQL stores, serialising them to
 * JSON, computing a SHA-256 integrity hash, and persisting the bundle in the
 * `saas_evidence_bundles` SaaS table (RLS-scoped per tenant).
 */

import { createHash } from "crypto";
import { withTenantRls, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { PostgresDriftEventsRepository } from "@/lib/server/store/driftevents-pg";
import type { DriftEvent } from "@/data/mock/types";
import type { HostSnapshot } from "@/lib/server/collector/types";

const { saasEvidenceBundles } = schema;

// ---------------------------------------------------------------------------
// Helpers to pull from legacy (non-Drizzle) tables
// ---------------------------------------------------------------------------

async function listAllBaselines(): Promise<Array<{ hostId: string; hostname: string; collectedAt: string; snapshot: HostSnapshot }>> {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) return [];
  try {
    const { Pool } = (await import("pg")).default ?? await import("pg");
    const cleanUrl = dbUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
    const sslOpts = dbUrl.includes("sslmode=") ? { ssl: { rejectUnauthorized: false } } : {};
    const pool = new Pool({ connectionString: cleanUrl, max: 2, ...sslOpts });
    const res = await pool.query<{ host_id: string; hostname: string; collected_at: string; data: unknown }>(
      "SELECT host_id, hostname, collected_at, data FROM blackglass_baselines ORDER BY collected_at DESC",
    );
    await pool.end();
    return res.rows.map((r) => ({
      hostId: r.host_id,
      hostname: r.hostname,
      collectedAt: r.collected_at,
      snapshot: (typeof r.data === "string" ? JSON.parse(r.data) : r.data) as HostSnapshot,
    }));
  } catch {
    return [];
  }
}

async function listAllDriftEvents(): Promise<DriftEvent[]> {
  try {
    return await PostgresDriftEventsRepository.getAll();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateBundleInput {
  tenantId: string;
  generatedBy: string;
  title: string;
  /** "all" or a specific hostId to limit scope */
  scope: string;
  notes?: string;
}

export interface BundleListItem {
  id: string;
  title: string;
  scope: string;
  sha256: string;
  generatedBy: string | null;
  createdAt: string;
}

export async function generateEvidenceBundle(input: GenerateBundleInput): Promise<BundleListItem> {
  const { tenantId, generatedBy, title, scope, notes } = input;

  // Collect source data
  const [allBaselines, allDrift] = await Promise.all([listAllBaselines(), listAllDriftEvents()]);

  const baselines = scope === "all"
    ? allBaselines
    : allBaselines.filter((b) => b.hostId === scope);

  const driftEvents = scope === "all"
    ? allDrift
    : allDrift.filter((e) => e.hostId === scope);

  const hostIds = [...new Set(baselines.map((b) => b.hostId))];

  // Build payload
  const payload: Record<string, unknown> = {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
    scope: { label: scope === "all" ? "All hosts" : scope, host_ids: hostIds },
    title,
    notes: notes ?? null,
    baseline_count: baselines.length,
    drift_event_count: driftEvents.length,
    baselines: baselines.map((b) => ({
      host_id: b.hostId,
      hostname: b.hostname,
      collected_at: b.collectedAt,
      snapshot: b.snapshot,
    })),
    drift_events: driftEvents,
  };

  const payloadJson = JSON.stringify(payload);
  const sha256 = createHash("sha256").update(payloadJson).digest("hex");

  // Persist via RLS
  const [bundle] = await withTenantRls(tenantId, (db) =>
    db
      .insert(saasEvidenceBundles)
      .values({
        tenantId,
        title,
        scope,
        sha256,
        payload,
        generatedBy,
      })
      .returning({
        id: saasEvidenceBundles.id,
        title: saasEvidenceBundles.title,
        scope: saasEvidenceBundles.scope,
        sha256: saasEvidenceBundles.sha256,
        generatedBy: saasEvidenceBundles.generatedBy,
        createdAt: saasEvidenceBundles.createdAt,
      }),
  );

  return {
    ...bundle,
    createdAt: bundle.createdAt.toISOString(),
  };
}

export async function listEvidenceBundles(tenantId: string): Promise<BundleListItem[]> {
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select({
        id: saasEvidenceBundles.id,
        title: saasEvidenceBundles.title,
        scope: saasEvidenceBundles.scope,
        sha256: saasEvidenceBundles.sha256,
        generatedBy: saasEvidenceBundles.generatedBy,
        createdAt: saasEvidenceBundles.createdAt,
      })
      .from(saasEvidenceBundles)
      .where(eq(saasEvidenceBundles.tenantId, tenantId))
      .orderBy(desc(saasEvidenceBundles.createdAt))
      .limit(100),
  );
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function getEvidenceBundlePayload(
  tenantId: string,
  bundleId: string,
): Promise<{ sha256: string; payload: Record<string, unknown>; title: string } | null> {
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select({
        sha256: saasEvidenceBundles.sha256,
        payload: saasEvidenceBundles.payload,
        title: saasEvidenceBundles.title,
      })
      .from(saasEvidenceBundles)
      .where(eq(saasEvidenceBundles.id, bundleId))
      .limit(1),
  );
  return rows[0] ?? null;
}
