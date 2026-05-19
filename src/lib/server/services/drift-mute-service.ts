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
import { normaliseHostId } from "@/lib/server/onboarding/host-id";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a caller-supplied hostId to the canonical `host-*` form.
 *  When the caller passes a UUID (saas_collector_hosts.id), look up the
 *  row's hostname and convert.  Any non-UUID string is run through
 *  normaliseHostId directly (idempotent for already-canonical IDs). */
async function resolveCanonicalHostId(
  tenantId: string,
  hostId: string,
): Promise<string> {
  if (!UUID_RE.test(hostId)) {
    try { return normaliseHostId(hostId); } catch { return hostId; }
  }
  try {
    const rows = await withTenantRls(tenantId, (db) =>
      db
        .select({ hostname: schema.saasCollectorHosts.hostname })
        .from(schema.saasCollectorHosts)
        .where(
          and(
            eq(schema.saasCollectorHosts.tenantId, tenantId),
            eq(schema.saasCollectorHosts.id, hostId),
          ),
        )
        .limit(1),
    );
    const hostname = rows[0]?.hostname;
    if (hostname) return normaliseHostId(hostname);
  } catch { /* fall through */ }
  // UUID that has no matching host row — return as-is so the mute is stored
  // without silently dropping the host constraint.
  return hostId;
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
  // Normalise hostId to canonical form (converts UUIDs from saas_collector_hosts.id
  // and plain IPs/hostnames to the `host-*` canonical form so mutes match
  // drift events which always use the canonical ID).
  const resolvedHostId = input.hostId
    ? await resolveCanonicalHostId(tenantId, input.hostId)
    : null;

  const [row] = await withTenantRls(tenantId, (db) =>
    db
      .insert(saasDriftMutes)
      .values({
        tenantId,
        category: input.category,
        titlePattern: input.titlePattern.toLowerCase(),
        hostId: resolvedHostId,
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
      if (m.hostId) {
        // Match the stored hostId against both the event's canonical hostId and
        // the canonical form of the stored hostId (handles legacy mutes that were
        // stored with a UUID or un-normalised hostname before the fix).
        let canonicalMuteHostId: string | null = null;
        try { canonicalMuteHostId = normaliseHostId(m.hostId); } catch { /* ignore */ }
        if (m.hostId !== e.hostId && canonicalMuteHostId !== e.hostId) return false;
      }
      if (!e.title.toLowerCase().includes(m.titlePattern)) return false;
      return true;
    });
    if (!matched) return e;
    return { ...e, lifecycle: "accepted_risk" };
  });
}
