import type { FleetSnapshot } from "@/data/mock/types";
import { fleetSnapshot as mockFleet } from "@/data/mock/fleet";
import { apiConfig } from "@/lib/api/config";
import { apiV1BaseUrl } from "@/lib/api/origin";
import { mockLatency } from "@/lib/mockLatency";
import { collectorConfigured } from "@/lib/server/collector";
import { loadFleetSnapshot } from "@/lib/server/inventory";

export type FleetPageData = {
  fleet: FleetSnapshot;
  /** Mock-only week-over-week KPI deltas; off when fleet data is SSH- or API-backed. */
  showDemoKpiDeltas: boolean;
};

async function fetchFleetSnapshotFromHttp(): Promise<FleetSnapshot> {
  const base = apiConfig.baseUrl || apiV1BaseUrl();
  const res = await fetch(`${base}/fleet/snapshot`, {
    next: { revalidate: 15 },
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Fleet snapshot failed (${res.status})`);
  }

  const raw = (await res.json()) as Partial<FleetSnapshot>;
  return {
    hostsChecked: raw.hostsChecked ?? 0,
    highRiskDrift: raw.highRiskDrift ?? 0,
    readyHosts: raw.readyHosts ?? 0,
    evidenceBundles: raw.evidenceBundles ?? 0,
    driftVolumeByDay: raw.driftVolumeByDay ?? [],
    fleetBullets: raw.fleetBullets ?? [],
    notableEvents: raw.notableEvents ?? [],
    coverage: raw.coverage ?? {
      collectorsExpected: 0,
      collectorsOnline: 0,
      lastFleetHeartbeatAt: new Date().toISOString(),
      staleSlices: [],
    },
  };
}

export async function fetchFleetPageData(): Promise<FleetPageData> {
  // Mock mode with no real collector: serve demo data with fake deltas.
  if (apiConfig.useMock && !collectorConfigured()) {
    await mockLatency(200);
    return { fleet: mockFleet, showDemoKpiDeltas: true };
  }

  // External API explicitly configured: use HTTP.
  if (apiConfig.baseUrl) {
    const fleet = await fetchFleetSnapshotFromHttp();
    return { fleet, showDemoKpiDeltas: false };
  }

  // Same-origin (default, including NEXT_PUBLIC_USE_MOCK=false): call server
  // function directly — avoids an HTTP round-trip that breaks on DO App Platform
  // when NEXT_PUBLIC_APP_URL is not set (would resolve to 127.0.0.1:3000).
  const fleet = await loadFleetSnapshot();
  return { fleet, showDemoKpiDeltas: false };
}
