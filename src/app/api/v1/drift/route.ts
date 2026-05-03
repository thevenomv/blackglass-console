/**
 * GET /api/v1/drift
 * Returns all drift events across the fleet.
 *
 * When the collector is configured, returns real events from the drift engine.
 * Falls back to mock data when collector is not configured.
 */

import { NextResponse } from "next/server";
import { zodErrorResponse } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { DriftQuerySchema } from "@/lib/server/http/schemas";
import { resolveDriftEventsForDashboard } from "@/lib/server/drift-resolve";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (isClerkAuthEnabled()) {
    const access = await requireSaasOrLegacyPermission("reports.view", [
      "viewer",
      "auditor",
      "operator",
      "admin",
    ]);
    if (!access.ok) return access.response;
  } else {
    const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
    if (!guard.ok) return guard.response;
  }

  const url = new URL(request.url);
  const parsed = DriftQuerySchema.safeParse({
    hostId: url.searchParams.get("hostId"),
    lifecycle: url.searchParams.get("lifecycle"),
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor"),
  });
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const { hostId, lifecycle: lifecycleFilter, limit, cursor } = parsed.data;

  let events = resolveDriftEventsForDashboard(hostId);

  if (lifecycleFilter) {
    events = events.filter((e) => e.lifecycle === lifecycleFilter);
  }

  const sorted = [...events].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  let start = 0;
  if (cursor) {
    try {
      const dec = Buffer.from(cursor, "base64url").toString("utf8");
      const n = parseInt(dec, 10);
      if (Number.isFinite(n) && n >= 0) start = n;
    } catch {
      /* ignore invalid cursor */
    }
  }
  const page = sorted.slice(start, start + limit);
  const nextCursor =
    start + limit < sorted.length
      ? Buffer.from(String(start + limit), "utf8").toString("base64url")
      : null;

  return NextResponse.json({
    items: page,
    total: sorted.length,
    next_cursor: nextCursor,
  });
}
