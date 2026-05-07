/**
 * Which drift events feed the dashboard — live engine only (no seeded mock rows).
 */

import type { DriftEvent } from "@/data/mock/types";
import { apiConfig } from "@/lib/api/config";
import { driftEvents as mockDriftEvents } from "@/data/mock/drift";
import { collectorConfigured } from "./collector";
import { getDriftEvents, getDriftEventsAsync } from "./drift-engine";
import { isSampleDataEnabled } from "./sample-data";

export function resolveDriftEventsForDashboard(hostId?: string): DriftEvent[] {
  // Sync version cannot read the cookie (next/headers needs await) — only
  // honours the env var. Server components / route handlers that want
  // tenant-toggle support should use the async version below.
  if (apiConfig.useMock && !collectorConfigured()) {
    const all = mockDriftEvents;
    return hostId ? all.filter((e) => e.hostId === hostId) : all;
  }
  return getDriftEvents(hostId);
}

export async function resolveDriftEventsForDashboardAsync(hostId?: string): Promise<DriftEvent[]> {
  const sampleEnabled = await isSampleDataEnabled();
  if ((apiConfig.useMock || sampleEnabled) && !collectorConfigured()) {
    const all = mockDriftEvents;
    return hostId ? all.filter((e) => e.hostId === hostId) : all;
  }
  return getDriftEventsAsync(hostId);
}
