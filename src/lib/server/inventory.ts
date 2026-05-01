import type { FleetSnapshot, HostRecord, HostTrust } from "@/data/mock/types";
import { fleetSnapshot } from "@/data/mock/fleet";
import { hosts } from "@/data/mock/hosts";
import { mockLatency } from "@/lib/mockLatency";
import { collectorConfigured, configuredHostCount } from "./collector";
import { getDriftEvents, hasDriftData } from "./drift-engine";
import { getBaseline, listBaselineHostIds } from "./baseline-store";
import { getDriftVolumeChartFromHistory } from "./drift-history";
import { evidenceBundleCatalogSize } from "./evidence-catalog";

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
    const baseline = getBaseline(hostId);

    return {
      id: hostId,
      hostname: baseline?.hostname ?? hostId,
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
  const expectedCollectors = configuredHostCount();
  const readyHosts = baselineIds.filter(
    (id) =>
      !allEvents.some(
        (e) => e.hostId === id && e.severity === "high" && e.lifecycle === "new",
      ),
  ).length;
  const monitoringHostCount = baselineIds.length;
  const monitoringBullet =
    monitoringHostCount === 0
      ? "No baselines captured yet"
      : `${monitoringHostCount} host${monitoringHostCount !== 1 ? "s" : ""} under active monitoring`;

  const notableEvents = allEvents.slice(0, 5).map((e) => ({
    hostId: e.hostId,
    slug: e.category,
    label: e.title,
  }));

  const driftVolumeByDay = getDriftVolumeChartFromHistory();

  return {
    hostsChecked: baselineIds.length,
    highRiskDrift: highRisk,
    readyHosts,
    evidenceBundles: evidenceBundleCatalogSize(),
    driftVolumeByDay,
    fleetBullets: hasData
      ? [
          `${allEvents.length} drift signal${allEvents.length !== 1 ? "s" : ""} detected`,
          `${highRisk} high-severity finding${highRisk !== 1 ? "s" : ""}`,
          monitoringBullet,
        ]
      : ["Baseline captured — run a scan to detect drift"],
    notableEvents,
    coverage: {
      collectorsExpected: expectedCollectors,
      collectorsOnline: baselineIds.length,
      lastFleetHeartbeatAt: new Date().toISOString(),
      staleSlices: [],
    },
  };
}
