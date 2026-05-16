/**
 * GET /api/v1/drift/trend
 *
 * Returns per-day drift event counts for the last N days (default: 7, max: 30).
 * Counts are bucketed by severity (high / medium / low) using the detectedAt
 * timestamp stored in Postgres drift events.
 *
 * Query params:
 *   days  — number of days to return (1–30, default 7)
 *
 * Response:
 *   { days: [{ ymd, label, high, medium, low, total }] }
 *
 * Tenant scoping
 * --------------
 * In SaaS mode the query is restricted to the caller's `saas_collector_hosts`
 * — every tenant only sees its own trend.  In legacy mode the trend spans
 * every host_id present in `blackglass_drift_events`.
 *
 * Falls back to an empty array when DATABASE_URL is not set.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { PostgresDriftEventsRepository } from "@/lib/server/store/legacy/driftevents-pg";
import { withTenantRls, schema } from "@/db";

interface TrendDay {
  ymd: string;
  label: string;
  high: number;
  medium: number;
  low: number;
  total: number;
}

async function tenantHostIds(tenantId: string): Promise<string[]> {
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select({ id: schema.saasCollectorHosts.id, hostname: schema.saasCollectorHosts.hostname })
      .from(schema.saasCollectorHosts)
      .where(eq(schema.saasCollectorHosts.tenantId, tenantId)),
  );
  // Drift events are stored under the synthetic id used by the collector
  // (e.g. host-167-172-224-47); we accept either the saas row id or the
  // hostname-derived id, so include both candidate keys.
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.id);
    if (r.hostname) ids.add(`host-${r.hostname.replace(/[^a-zA-Z0-9]/g, "-")}`);
  }
  return Array.from(ids);
}

async function buildTrend(
  days: number,
  hostIds?: string[],
): Promise<{ days: TrendDay[]; degraded: boolean }> {
  if (!process.env.DATABASE_URL?.trim()) {
    return { days: [], degraded: false };
  }
  let buckets: Array<{ ymd: string; severity: string; count: number }>;
  try {
    buckets = await PostgresDriftEventsRepository.trendByDay(days, hostIds);
  } catch (err) {
    // Surface as `degraded: true` so the UI can render an explicit
    // "trend unavailable" state instead of silently showing zeros
    // (which previously read as "no findings detected").
    console.error("[drift/trend] query failed:", err);
    return { days: [], degraded: true };
  }

  const byDay = new Map<string, { high: number; medium: number; low: number }>();
  for (const row of buckets) {
    const entry = byDay.get(row.ymd) ?? { high: 0, medium: 0, low: 0 };
    if (row.severity === "high") entry.high += row.count;
    else if (row.severity === "medium") entry.medium += row.count;
    else entry.low += row.count;
    byDay.set(row.ymd, entry);
  }

  const result: TrendDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const ymd = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
    const counts = byDay.get(ymd) ?? { high: 0, medium: 0, low: 0 };
    result.push({ ymd, label, ...counts, total: counts.high + counts.medium + counts.low });
  }
  return { days: result, degraded: false };
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission(
    "reports.view",
    ["viewer", "auditor", "operator", "admin"],
    { request, scope: "drift.read" },
  );
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") ?? "7", 10);
  const days = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 30 ? rawDays : 7;

  const hostIds = access.mode === "saas" ? await tenantHostIds(access.ctx.tenant.id) : undefined;
  const trend = await buildTrend(days, hostIds);
  return NextResponse.json({ days: trend.days, degraded: trend.degraded });
}
