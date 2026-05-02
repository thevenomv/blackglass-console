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
import { DriftQuerySchema } from "@/lib/server/http/schemas";
import { resolveDriftEventsForDashboard } from "@/lib/server/drift-resolve";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const parsed = DriftQuerySchema.safeParse({
    hostId: url.searchParams.get("hostId"),
    lifecycle: url.searchParams.get("lifecycle"),
  });
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const { hostId, lifecycle: lifecycleFilter } = parsed.data;

  let events = resolveDriftEventsForDashboard(hostId);

  if (lifecycleFilter) {
    events = events.filter((e) => e.lifecycle === lifecycleFilter);
  }

  return NextResponse.json({ items: events, total: events.length });
}
