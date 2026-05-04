/**
 * Which drift events feed the dashboard — live engine only (no seeded mock rows).
 */

import type { DriftEvent } from "@/data/mock/types";
import { apiConfig } from "@/lib/api/config";
import { driftEvents as mockDriftEvents } from "@/data/mock/drift";
import { collectorConfigured } from "./collector";
import { getDriftEvents } from "./drift-engine";

export function resolveDriftEventsForDashboard(hostId?: string): DriftEvent[] {
  if (apiConfig.useMock && !collectorConfigured()) {
    const all = mockDriftEvents;
    return hostId ? all.filter((e) => e.hostId === hostId) : all;
  }
  return getDriftEvents(hostId);
}
