/**
 * Read-only GCE aggregated disk inventory (service account JSON).
 */

import { GoogleAuth } from "google-auth-library";
import { fetchWithCloudRetry } from "@/lib/server/janitor/cloud-api-retry";

export type GceDiskBrief = {
  id: string;
  name: string;
  zone: string;
  sizeGb: number;
  users: string[];
  labels: Record<string, string>;
  creationTimestamp?: string;
};

export type GceSnapshotBrief = {
  id: string;
  name: string;
  diskSizeGb: number;
  creationTimestamp?: string;
  labels: Record<string, string>;
  snapshotScope: "global" | "regional";
  /** Present when `snapshotScope` is `regional` (aggregated list key). */
  region?: string;
};

type AggregatedResponse = {
  items?: Record<
    string,
    {
      disks?: {
        id?: string;
        name?: string;
        sizeGb?: string;
        users?: string[];
        labels?: Record<string, string>;
        creationTimestamp?: string;
      }[];
      snapshots?: {
        id?: string;
        name?: string;
        diskSizeGb?: string;
        creationTimestamp?: string;
        labels?: Record<string, string>;
      }[];
    }
  >;
};

export function parseGcpServiceAccountJson(raw: string): Record<string, unknown> {
  const o = JSON.parse(raw) as Record<string, unknown>;
  if (o.type !== "service_account" || typeof o.project_id !== "string") {
    throw new Error("gcp_service_account_invalid");
  }
  return o;
}

export async function listGceInventory(saJson: string): Promise<{
  disks: GceDiskBrief[];
  snapshots: GceSnapshotBrief[];
}> {
  const creds = parseGcpServiceAccountJson(saJson);
  const projectId = creds.project_id as string;

  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/compute.readonly"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error("gcp_token_failed");
  }

  const headers = { Authorization: `Bearer ${token.token}` };
  const diskUrl = `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(projectId)}/aggregated/disks`;
  const snapUrl = `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(projectId)}/aggregated/snapshots`;

  const [diskRes, snapRes] = await Promise.all([
    fetchWithCloudRetry(diskUrl, { headers, cache: "no-store" }),
    fetchWithCloudRetry(snapUrl, { headers, cache: "no-store" }),
  ]);

  if (!diskRes.ok) {
    const t = await diskRes.text();
    throw new Error(`gcp_disks_${diskRes.status}:${t.slice(0, 200)}`);
  }
  if (!snapRes.ok) {
    const t = await snapRes.text();
    throw new Error(`gcp_snapshots_${snapRes.status}:${t.slice(0, 200)}`);
  }

  const diskJson = (await diskRes.json()) as AggregatedResponse;
  const snapJson = (await snapRes.json()) as AggregatedResponse;

  const disksZoned: GceDiskBrief[] = [];
  for (const [key, wrap] of Object.entries(diskJson.items ?? {})) {
    const zone = key.startsWith("zones/") ? key.slice("zones/".length) : "unknown";
    for (const d of wrap.disks ?? []) {
      if (!d.id || !d.name) continue;
      disksZoned.push({
        id: d.id,
        name: d.name,
        zone,
        sizeGb: parseInt(String(d.sizeGb ?? "0"), 10) || 0,
        users: d.users ?? [],
        labels: d.labels ?? {},
        creationTimestamp: d.creationTimestamp,
      });
    }
  }

  const snapshots: GceSnapshotBrief[] = [];
  for (const [aggKey, wrap] of Object.entries(snapJson.items ?? {})) {
    let snapshotScope: "global" | "regional" = "global";
    let region: string | undefined;
    if (aggKey.startsWith("regions/")) {
      snapshotScope = "regional";
      region = aggKey.slice("regions/".length);
    }
    for (const s of wrap.snapshots ?? []) {
      if (!s.id || !s.name) continue;
      snapshots.push({
        id: s.id,
        name: s.name,
        diskSizeGb: parseInt(String(s.diskSizeGb ?? "0"), 10) || 0,
        creationTimestamp: s.creationTimestamp,
        labels: s.labels ?? {},
        snapshotScope,
        region,
      });
    }
  }

  return { disks: disksZoned, snapshots };
}
