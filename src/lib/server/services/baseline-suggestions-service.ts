/**
 * Baseline-suggestion heuristic.
 *
 * NOT machine learning — a frequency-based heuristic that surfaces
 * drift patterns the operator has already accepted, so they can be
 * promoted into the baseline once instead of being re-acknowledged
 * forever. This is the "ML baseline suggestions" backlog item
 * deliberately scoped down to a deterministic SQL aggregation; we
 * can graduate to a real model once we have enough labelled data
 * to train against.
 *
 * Inputs:
 *   - the `drift_events` partitioned table (one row per drift
 *     finding emission, immutable history)
 *   - the `saas_drift_mutes` table (per-tenant title patterns the
 *     operator has marked as "fine, stop alerting")
 *
 * Suggestion criteria (all must be true):
 *   1. Same (category, title) appears across at least N distinct
 *      hosts in the tenant. Default N=3 — tune via env
 *      `BASELINE_SUGGESTION_MIN_HOSTS`.
 *   2. The most-recent occurrence has lifecycle in
 *      ('accepted_risk','triaged') OR is matched by an active mute
 *      pattern. We don't suggest baselining `new` or `remediated`
 *      drift — those still warrant attention.
 *   3. The pattern has been seen for at least M days. Default M=7;
 *      tune via env `BASELINE_SUGGESTION_MIN_AGE_DAYS`. Stops a
 *      single bad-day burst from showing up as a "stable" pattern.
 *
 * Output is sorted by host_count desc so the highest-impact
 * suggestions surface first.
 */

import { sql } from "drizzle-orm";
import { tryGetDb, withTenantRls } from "@/db";

export interface BaselineSuggestion {
  category: string;
  title: string;
  hostCount: number;
  /** Most recent occurrence — used to gauge how stale the suggestion is. */
  lastSeenAt: string;
  /** True when at least one occurrence is matched by an active mute pattern. */
  matchedByMute: boolean;
  /** Sample affected hostnames, capped at 5 for the UI hint. */
  sampleHostIds: string[];
}

function readMinHosts(): number {
  const raw = Number(process.env.BASELINE_SUGGESTION_MIN_HOSTS ?? 3);
  if (!Number.isFinite(raw) || raw < 2) return 3;
  return Math.min(raw, 50);
}

function readMinAgeDays(): number {
  const raw = Number(process.env.BASELINE_SUGGESTION_MIN_AGE_DAYS ?? 7);
  if (!Number.isFinite(raw) || raw < 1) return 7;
  return Math.min(raw, 365);
}

/**
 * Compute baseline suggestions for the given tenant. Returns up to
 * `limit` suggestions ordered by host count (descending).
 *
 * Implementation note: we use raw SQL via Drizzle's `sql` helper
 * because the aggregation needs HAVING + window functions that the
 * query builder makes ugly to express. The query is fully
 * tenant-scoped via the WHERE clause AND the surrounding RLS
 * context (belt + suspenders).
 */
export async function getBaselineSuggestions(
  tenantId: string,
  limit = 20,
): Promise<BaselineSuggestion[]> {
  if (!tryGetDb()) return [];

  const minHosts = readMinHosts();
  const minAgeDays = readMinAgeDays();
  // Defensive cap so a misuse can't return the entire history.
  const cap = Math.min(Math.max(limit, 1), 200);

  return withTenantRls(tenantId, async (db) => {
    const result = await db.execute(sql`
      WITH suggestion_base AS (
        SELECT
          de.category,
          de.title,
          COUNT(DISTINCT de.host_id)::int AS host_count,
          MAX(de.detected_at)             AS last_seen_at,
          MIN(de.detected_at)             AS first_seen_at,
          ARRAY_AGG(DISTINCT de.host_id ORDER BY de.host_id) FILTER (WHERE de.host_id IS NOT NULL) AS host_ids,
          BOOL_OR(de.lifecycle IN ('accepted_risk','triaged')) AS any_accepted
        FROM drift_events de
        WHERE de.tenant_id = ${tenantId}
          AND de.detected_at >= NOW() - INTERVAL '180 days'
        GROUP BY de.category, de.title
      ),
      mute_match AS (
        SELECT
          sb.category,
          sb.title,
          BOOL_OR(
            -- Mute pattern matches when the title contains the mute's
            -- title_pattern (we deliberately keep this as ILIKE rather
            -- than regex to align with the mute-creation UX).
            sb.title ILIKE '%' || m.title_pattern || '%'
            AND (m.muted_until IS NULL OR m.muted_until > NOW())
            AND (m.host_id IS NULL OR sb.host_ids @> ARRAY[m.host_id])
          ) AS matched
        FROM suggestion_base sb
        LEFT JOIN saas_drift_mutes m
          ON m.tenant_id = ${tenantId}
         AND m.category = sb.category
        GROUP BY sb.category, sb.title
      )
      SELECT
        sb.category,
        sb.title,
        sb.host_count,
        sb.last_seen_at,
        sb.host_ids[1:5] AS sample_host_ids,
        COALESCE(mm.matched, FALSE) AS matched_by_mute
      FROM suggestion_base sb
      LEFT JOIN mute_match mm
        ON mm.category = sb.category AND mm.title = sb.title
      WHERE sb.host_count >= ${minHosts}
        AND sb.first_seen_at <= NOW() - (${minAgeDays} || ' days')::interval
        AND (sb.any_accepted OR COALESCE(mm.matched, FALSE))
      ORDER BY sb.host_count DESC, sb.last_seen_at DESC
      LIMIT ${cap}
    `);

    type Row = {
      category: string;
      title: string;
      host_count: number;
      last_seen_at: Date;
      sample_host_ids: string[] | null;
      matched_by_mute: boolean;
    };
    // node-postgres returns { rows }; better-sqlite3 returns the
    // array directly. Both shapes get widened through unknown so
    // this works on either driver. The runtime fields are
    // determined by the SELECT list above.
    const raw = result as unknown as { rows?: unknown[] } | unknown[];
    const rows = (Array.isArray(raw) ? raw : (raw.rows ?? [])) as Row[];

    return rows.map((r) => ({
      category: r.category,
      title: r.title,
      hostCount: Number(r.host_count),
      lastSeenAt:
        r.last_seen_at instanceof Date
          ? r.last_seen_at.toISOString()
          : new Date(r.last_seen_at).toISOString(),
      sampleHostIds: r.sample_host_ids ?? [],
      matchedByMute: Boolean(r.matched_by_mute),
    }));
  });
}

/**
 * Internals exposed for tests only.
 */
export const __internals = {
  readMinHosts,
  readMinAgeDays,
};
