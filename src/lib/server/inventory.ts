import type { FleetSnapshot, HostRecord } from "@/data/mock/types";
import { fleetSnapshot } from "@/data/mock/fleet";
import { hosts } from "@/data/mock/hosts";
import { mockLatency } from "@/lib/mockLatency";

/** Single source for mock inventory — API routes and SSR can share this. */
export async function loadHosts(): Promise<HostRecord[]> {
  await mockLatency(40);
  return hosts;
}

export async function loadFleetSnapshot(): Promise<FleetSnapshot> {
  await mockLatency(40);
  return fleetSnapshot;
}
