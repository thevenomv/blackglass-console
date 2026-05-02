import type { HostRecord } from "@/data/mock/types";
import { hosts as mockHosts } from "@/data/mock/hosts";
import { apiConfig } from "@/lib/api/config";
import { apiV1BaseUrl } from "@/lib/api/origin";
import { mockLatency } from "@/lib/mockLatency";
import { collectorConfigured } from "@/lib/server/collector";
import { loadHosts } from "@/lib/server/inventory";
import { getLimits } from "@/lib/plan";

export type HostsResult = {
  items: HostRecord[];
  atCap: boolean;
  hostCap: number | null;
  plan: string;
};

export async function fetchHosts(): Promise<HostsResult> {
  if (apiConfig.useMock) {
    const all = collectorConfigured() ? await loadHosts() : mockHosts;
    if (!collectorConfigured()) await mockLatency(180);
    const limits = getLimits();
    const items = limits.maxHosts === -1 ? all : all.slice(0, limits.maxHosts);
    return {
      items,
      atCap: limits.maxHosts !== -1 && all.length >= limits.maxHosts,
      hostCap: limits.maxHosts === -1 ? null : limits.maxHosts,
      plan: limits.name,
    };
  }

  const base = apiConfig.baseUrl || apiV1BaseUrl();
  const res = await fetch(`${base}/hosts`, {
    next: { revalidate: 30 },
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Hosts request failed (${res.status})`);
  }

  const body = (await res.json()) as {
    items?: HostRecord[];
    at_cap?: boolean;
    host_cap?: number | null;
    plan?: string;
  };
  return {
    items: body.items ?? [],
    atCap: body.at_cap ?? false,
    hostCap: body.host_cap ?? null,
    plan: body.plan ?? "free",
  };
}
