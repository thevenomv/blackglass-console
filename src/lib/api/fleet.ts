import type { FleetSnapshot } from "@/data/mock/types";
import { fleetSnapshot as mockFleet } from "@/data/mock/fleet";
import { apiConfig } from "@/lib/api/config";
import { apiV1BaseUrl } from "@/lib/api/origin";
import { mockLatency } from "@/lib/mockLatency";

export async function fetchFleetSnapshot(): Promise<FleetSnapshot> {
  if (apiConfig.useMock) {
    await mockLatency(200);
    return mockFleet;
  }

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
