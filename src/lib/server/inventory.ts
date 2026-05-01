import type { FleetSnapshot, HostRecord, HostTrust } from "@/data/mock/types";
import { fleetSnapshot } from "@/data/mock/fleet";
import { hosts } from "@/data/mock/hosts";
import { mockLatency } from "@/lib/mockLatency";
import { collectorConfigured } from "./collector";
import { getDriftEvents, hasDriftData } from "./drift-engine";
import { listBaselineHostIds } from "./baseline-store";

/** Single source for mock inventory — API routes and SSR can share this. */
export async function loadHosts(): Promise<HostRecord[]> {
  if (!collectorConfigured()) {
    await mockLatency(40);
    return hosts;
  }
  return buildRealHosts();
}

export async function loadFleetSnapshot(): Promise<FleetSnapshot> {
  if (!collectorConfigured()) {
    await mockLatency(40);
    return fleetSnapshot;
  }
  return buildRealFleetSnapshot();
}

// ---------------------------------------------------------------------------
// Real-data builders — only called when collector env vars are set
// ---------------------------------------------------------------------------

function buildRealHosts(): HostRecord[] {
  const baselineIds = new Set(listBaselineHostIds());
  if (baselineIds.size === 0) return [];

  return [...baselineIds].map((hostId) => {
    const events = getDriftEvents(hostId);
    const high = events.filter((e) => e.severity === "high" && e.lifecycle === "new").length;
    const any = events.filter((e) => e.lifecycle === "new").length;

    let trust: HostTrust = "aligned";
    if (high >= 2) trust = "critical";
    else if (high >= 1) trust = "drift";
    else if (any > 0) trust = "needs_review";

    const score = Math.max(0, 100 - high * 15 - (any - high) * 5);

    return {
      id: hostId,
      hostname: process.env.COLLECTOR_HOST_1_NAME ?? hostId,
      os: "Ubuntu 24.04",
      trust,
      lastScanAt: new Date().toISOString(),
      baselineAligned: trust === "aligned",
      readinessScore: score,
    };
  });
}

function buildRealFleetSnapshot(): FleetSnapshot {
  const baselineIds = listBaselineHostIds();
  const allEvents = getDriftEvents();
  const hasData = hasDriftData();

  const highRisk = allEvents.filter(
    (e) => e.severity === "high" && e.lifecycle === "new",
  ).length;
  const readyHosts = baselineIds.length > 0 && highRisk === 0 ? 1 : 0;

  const notableEvents = allEvents.slice(0, 5).map((e) => ({
    hostId: e.hostId,
    slug: e.category,
    label: e.title,
  }));

  return {
    hostsChecked: baselineIds.length > 0 ? 1 : 0,
    highRiskDrift: highRisk,
    readyHosts,
    evidenceBundles: hasData ? 1 : 0,
    driftVolumeByDay: [],
    fleetBullets: hasData
      ? [
          `${allEvents.length} drift signal${allEvents.length !== 1 ? "s" : ""} detected`,
          `${highRisk} high-severity finding${highRisk !== 1 ? "s" : ""}`,
          baselineIds.length > 0
            ? "1 host under active monitoring"
            : "No baselines captured yet",
        ]
      : ["Baseline captured — run a scan to detect drift"],
    notableEvents,
    coverage: {
      collectorsExpected: 1,
      collectorsOnline: baselineIds.length > 0 ? 1 : 0,
      lastFleetHeartbeatAt: new Date().toISOString(),
      staleSlices: [],
    },
  };
}
