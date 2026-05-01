/**
 * Single place for “which drift events feed the dashboard / drift API”, so SSR and
 * collectors stay aligned without duplicating the mock fallback rules.
 */

import { driftEvents as mockDriftEvents } from "@/data/mock/drift";
import type { DriftEvent } from "@/data/mock/types";
import { collectorConfigured } from "./collector";
import { getDriftEvents, hasDriftData } from "./drift-engine";

export function resolveDriftEventsForDashboard(hostId?: string): DriftEvent[] {
  if (collectorConfigured() && hasDriftData()) {
    return getDriftEvents(hostId);
  }
  const all = mockDriftEvents;
  return hostId ? all.filter((e) => e.hostId === hostId) : all;
}
