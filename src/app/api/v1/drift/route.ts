/**
 * GET /api/v1/drift
 * Returns all drift events across the fleet.
 *
 * When the collector is configured, returns real events from the drift engine.
 * Falls back to mock data when collector is not configured.
 */

import { NextResponse } from "next/server";
import { collectorConfigured } from "@/lib/server/collector";
import { getDriftEvents, hasDriftData } from "@/lib/server/drift-engine";
import { driftEvents as mockDriftEvents } from "@/data/mock/drift";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hostId = url.searchParams.get("hostId") ?? undefined;
  const lifecycleFilter = url.searchParams.get("lifecycle") ?? undefined;

  let events = collectorConfigured() && hasDriftData()
    ? getDriftEvents(hostId)
    : mockDriftEvents;

  if (lifecycleFilter) {
    events = events.filter((e) => e.lifecycle === lifecycleFilter);
  }

  return NextResponse.json({ items: events, total: events.length });
}
