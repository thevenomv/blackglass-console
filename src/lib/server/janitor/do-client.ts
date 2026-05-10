/**
 * DigitalOcean API client for Charon — read-only list + monitoring metrics.
 */

import { sleepMs } from "@/lib/server/janitor/cloud-api-retry";

const DO_API = "https://api.digitalocean.com/v2";

export type DoDroplet = {
  id: number;
  name: string;
  status: string;
  created_at: string;
  size_slug: string;
  tags?: string[];
  region?: { slug?: string };
};

export type DoVolume = {
  id: string;
  name: string;
  region?: { slug?: string };
  droplet_ids?: number[];
  size_gigabytes: number;
  created_at?: string;
};

export type DoSnapshot = {
  id: string;
  name: string;
  resource_id: string;
  resource_type: string;
  created_at?: string;
  size_gigabytes: number;
  tags?: string[];
};

async function doRequest<T>(token: string, pathAndQuery: string): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
  const url = `${DO_API}${pathAndQuery}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store" });
    const body = await res.text();
    if (res.status === 429 && attempt < 3) {
      await sleepMs(200 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      return { ok: false, status: res.status, body: body.slice(0, 500) };
    }
    try {
      return { ok: true, data: JSON.parse(body) as T };
    } catch {
      return { ok: false, status: res.status, body: "invalid_json" };
    }
  }
  return { ok: false, status: 429, body: "rate_limited" };
}

/** Probe read scopes by hitting small list endpoints. */
export async function validateDigitalOceanToken(token: string): Promise<
  | { ok: true; verified: string[] }
  | { ok: false; status: number; detail: string }
> {
  const verified: string[] = [];

  const acct = await doRequest<{ account?: { uuid?: string } }>(token, "/account");
  if (!acct.ok) {
    return {
      ok: false,
      status: acct.status,
      detail: acct.body || "account_unreachable",
    };
  }
  verified.push("account:read");

  const drops = await doRequest<{ droplets?: unknown[] }>(token, "/droplets?per_page=1");
  if (drops.ok) verified.push("droplet:read");
  else if (drops.status === 403) return { ok: false, status: 403, detail: "droplet_read_forbidden" };

  for (const region of ["nyc1", "sfo3", "lon1", "fra1", "sgp1"] as const) {
    const vols = await doRequest<{ volumes?: unknown[] }>(
      token,
      `/volumes?per_page=1&region=${region}`,
    );
    if (vols.ok) {
      verified.push("volume:read");
      break;
    }
    if (vols.status === 403) {
      return { ok: false, status: 403, detail: "volume_read_forbidden" };
    }
  }

  const snaps = await doRequest<{ snapshots?: unknown[] }>(
    token,
    "/snapshots?resource_type=Droplet&per_page=1",
  );
  if (snaps.ok) verified.push("snapshot:read");
  else if (snaps.status === 403) {
    return { ok: false, status: 403, detail: "snapshot_read_forbidden" };
  }

  return { ok: true, verified };
}

async function collectPaged<T>(token: string, firstPath: string, arrayKey: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = `${DO_API}${firstPath}`;

  while (next) {
    const res = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`DO API ${res.status}: ${text.slice(0, 200)}`);
    }
    const body = JSON.parse(text) as {
      links?: { pages?: { next?: string } };
      [k: string]: unknown;
    };
    const chunk = body[arrayKey];
    if (Array.isArray(chunk)) {
      out.push(...(chunk as T[]));
    }
    next = body.links?.pages?.next ?? null;
  }
  return out;
}

export function listDroplets(token: string): Promise<DoDroplet[]> {
  return collectPaged<DoDroplet>(token, "/droplets?per_page=200", "droplets");
}

const FALLBACK_VOLUME_REGIONS = [
  "nyc1",
  "sfo3",
  "lon1",
  "fra1",
  "sgp1",
  "tor1",
  "blr1",
  "syd1",
  "atl1",
] as const;

/** Volumes are listed per region — union droplet regions + common DCs, deduped. */
export async function listVolumesAllRegions(token: string): Promise<DoVolume[]> {
  const droplets = await listDroplets(token);
  const regions = new Set<string>(FALLBACK_VOLUME_REGIONS);
  for (const d of droplets) {
    if (d.region?.slug) regions.add(d.region.slug);
  }
  const byId = new Map<string, DoVolume>();
  for (const region of regions) {
    try {
      const chunk = await collectPaged<DoVolume>(
        token,
        `/volumes?per_page=200&region=${encodeURIComponent(region)}`,
        "volumes",
      );
      for (const v of chunk) {
        byId.set(v.id, v);
      }
    } catch {
      /* ignore missing/empty regions */
    }
  }
  return [...byId.values()];
}

export function listDropletSnapshots(token: string): Promise<DoSnapshot[]> {
  return collectPaged<DoSnapshot>(
    token,
    "/snapshots?resource_type=Droplet&per_page=200",
    "snapshots",
  );
}

type MetricResponse = {
  status?: string;
  data?: { result?: Array<{ values?: Array<[number, string]> }> };
};

/**
 * Returns average metric value over the window, or null if unavailable.
 * CPU is typically 0–100; network_tx is bytes per step.
 */
export async function deleteDroplet(token: string, dropletId: number): Promise<void> {
  const res = await fetch(`${DO_API}/droplets/${dropletId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const t = await res.text();
    throw new Error(`do_droplet_delete_${res.status}:${t.slice(0, 200)}`);
  }
}

export async function deleteVolume(token: string, volumeId: string, region: string): Promise<void> {
  const q = new URLSearchParams({ region });
  const res = await fetch(`${DO_API}/volumes/${encodeURIComponent(volumeId)}?${q}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const t = await res.text();
    throw new Error(`do_volume_delete_${res.status}:${t.slice(0, 200)}`);
  }
}

export async function deleteSnapshot(token: string, snapshotId: string): Promise<void> {
  const res = await fetch(`${DO_API}/snapshots/${encodeURIComponent(snapshotId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const t = await res.text();
    throw new Error(`do_snapshot_delete_${res.status}:${t.slice(0, 200)}`);
  }
}

export async function dropletMetricAverage(
  token: string,
  hostId: number,
  metric: "cpu" | "network_tx",
  startSec: number,
  endSec: number,
  stepSec: number,
): Promise<number | null> {
  const path = `/monitoring/metrics/droplet/${metric}?host_id=${hostId}&start=${startSec}&end=${endSec}&step=${stepSec}`;
  const r = await doRequest<MetricResponse>(token, path);
  if (!r.ok) return null;
  const series = r.data.data?.result?.[0]?.values;
  if (!series?.length) return null;
  let sum = 0;
  let n = 0;
  for (const [, v] of series) {
    const x = parseFloat(v);
    if (!Number.isFinite(x)) continue;
    sum += x;
    n += 1;
  }
  if (n === 0) return null;
  return sum / n;
}
