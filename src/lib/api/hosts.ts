import type { HostRecord } from "@/data/mock/types";
import { hosts as mockHosts } from "@/data/mock/hosts";
import { apiConfig } from "@/lib/api/config";
import { apiV1BaseUrl } from "@/lib/api/origin";
import { mockLatency } from "@/lib/mockLatency";
import { collectorConfigured } from "@/lib/server/collector";
import { loadHosts } from "@/lib/server/inventory";

export async function fetchHosts(): Promise<HostRecord[]> {
  if (apiConfig.useMock) {
    if (collectorConfigured()) {
      return loadHosts();
    }
    await mockLatency(180);
    return mockHosts;
  }

  const base = apiConfig.baseUrl || apiV1BaseUrl();
  const res = await fetch(`${base}/hosts`, {
    next: { revalidate: 30 },
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Hosts request failed (${res.status})`);
  }

  const body = (await res.json()) as { items?: HostRecord[] };
  return body.items ?? [];
}
