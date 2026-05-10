/**
 * Drift mute / snooze rules per tenant.
 *
 * Used by the scan worker to automatically mark known-noisy findings as
 * `accepted_risk` instead of `new`, without dropping them from the audit
 * trail.  Read with bypass-RLS from the worker (it has no per-request
 * tenant context); CRUD endpoints read/write under tenant RLS.
 */

import { withBypassRls, withTenantRls, schema, tryGetDb } from "@/db";
import { and, asc, eq } from "drizzle-orm";

const { saasDriftMutes } = schema;

export interface DriftMuteInput {
  category: string;
  titlePattern: string;
  hostId?: string | null;
  reason?: string | null;
  mutedUntil?: string | null; // ISO
}

export interface DriftMuteRule {
  id: string;
  category: string;
  titlePattern: string;
  hostId: string | null;
  reason: string | null;
  mutedUntil: string | null;
  createdBy: string | null;
  createdAt: string;
}

function rowToView(row: typeof saasDriftMutes.$inferSelect): DriftMuteRule {
  return {
    id: row.id,
    category: row.category,
    titlePattern: row.titlePattern,
    hostId: row.hostId,
    reason: row.reason,
    mutedUntil: row.mutedUntil?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMutes(tenantId: string): Promise<DriftMuteRule[]> {
  if (!tryGetDb()) return [];
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasDriftMutes)
      .where(eq(saasDriftMutes.tenantId, tenantId))
      .orderBy(asc(saasDriftMutes.createdAt)),
  );
  return rows.map(rowToView);
}

/** Worker-side fetch — bypass RLS, returns raw rows. */
export async function listActiveMutesForWorker(
  tenantId: string,
): Promise<DriftMuteRule[]> {
  if (!tryGetDb()) return [];
  // RLS-BYPASS: scan-worker reads mute rules while computing drift; worker
  // has no per-request tenant context, queries are explicitly scoped by the
  // tenantId carried in the job payload.
  const rows = await withBypassRls((db) =>
    db
      .select()
      .from(saasDriftMutes)
      .where(eq(saasDriftMutes.tenantId, tenantId)),
  );
  const now = new Date();
  return rows
    .filter((r) => !r.mutedUntil || r.mutedUntil > now)
    .map(rowToView);
}

export async function createMute(
  tenantId: string,
  actorUserId: string | null,
  input: DriftMuteInput,
): Promise<DriftMuteRule> {
  const [row] = await withTenantRls(tenantId, (db) =>
    db
      .insert(saasDriftMutes)
      .values({
        tenantId,
        category: input.category,
        titlePattern: input.titlePattern.toLowerCase(),
        hostId: input.hostId ?? null,
        reason: input.reason ?? null,
        mutedUntil: input.mutedUntil ? new Date(input.mutedUntil) : null,
        createdBy: actorUserId,
      })
      .returning(),
  );
  return rowToView(row!);
}

export async function deleteMute(tenantId: string, id: string): Promise<boolean> {
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .delete(saasDriftMutes)
      .where(and(eq(saasDriftMutes.tenantId, tenantId), eq(saasDriftMutes.id, id)))
      .returning({ id: saasDriftMutes.id }),
  );
  return rows.length > 0;
}

/**
 * Filter — given a set of computed drift events for a single host, mutate
 * matching ones to lifecycle = "accepted_risk" so they still appear in the
 * audit trail but stop alerting.  Pure: returns a new array.
 */
export function applyMutes<T extends { category: string; title: string; hostId: string; lifecycle: string }>(
  events: T[],
  mutes: DriftMuteRule[],
): T[] {
  if (mutes.length === 0) return events;
  return events.map((e) => {
    const matched = mutes.find((m) => {
      if (m.category !== e.category) return false;
      if (m.hostId && m.hostId !== e.hostId) return false;
      if (!e.title.toLowerCase().includes(m.titlePattern)) return false;
      return true;
    });
    if (!matched) return e;
    return { ...e, lifecycle: "accepted_risk" };
  });
}
