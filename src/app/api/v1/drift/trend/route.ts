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
 * Falls back to an empty array when DATABASE_URL is not set.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";

interface TrendDay {
  ymd: string;
  label: string;
  high: number;
  medium: number;
  low: number;
  total: number;
}

async function queryTrendFromPg(days: number): Promise<TrendDay[]> {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) return [];

  try {
    const { Pool } = await import("pg");
    const cleanUrl = dbUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
    const sslOpts = dbUrl.includes("sslmode=") ? { ssl: { rejectUnauthorized: false } } : {};
    const pool = new Pool({ connectionString: cleanUrl, max: 2, ...sslOpts });

    // Unnest the JSONB event arrays and group by day + severity
    const res = await pool.query<{
      ymd: string;
      severity: string;
      cnt: string;
    }>(
      `SELECT
         to_char((e->>'detectedAt')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS ymd,
         e->>'severity' AS severity,
         COUNT(*)::text AS cnt
       FROM blackglass_drift_events,
            jsonb_array_elements(events) AS e
       WHERE (e->>'detectedAt')::timestamptz >= NOW() - ($1 || ' days')::interval
       GROUP BY 1, 2
       ORDER BY 1`,
      [days],
    );

    await pool.end();

    // Build a map: ymd → { high, medium, low }
    const byDay = new Map<string, { high: number; medium: number; low: number }>();
    for (const row of res.rows) {
      const entry = byDay.get(row.ymd) ?? { high: 0, medium: 0, low: 0 };
      const count = parseInt(row.cnt, 10) || 0;
      if (row.severity === "high") entry.high += count;
      else if (row.severity === "medium") entry.medium += count;
      else entry.low += count;
      byDay.set(row.ymd, entry);
    }

    // Fill the last N days, including zero-count days
    const result: TrendDay[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const ymd = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
      const counts = byDay.get(ymd) ?? { high: 0, medium: 0, low: 0 };
      result.push({ ymd, label, ...counts, total: counts.high + counts.medium + counts.low });
    }

    return result;
  } catch (err) {
    console.error("[drift/trend] query failed:", err);
    return [];
  }
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("reports.view", [
    "viewer", "auditor", "operator", "admin",
  ]);
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") ?? "7", 10);
  const days = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 30 ? rawDays : 7;

  const trendDays = await queryTrendFromPg(days);
  return NextResponse.json({ days: trendDays });
}
