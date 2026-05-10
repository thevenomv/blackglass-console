/**
 * Live GCE disk / snapshot deletes for approved Charon cleanup.
 */

import { GoogleAuth } from "google-auth-library";
import type { JanitorFinding } from "@/db/schema";
import { fetchWithCloudRetry } from "@/lib/server/janitor/cloud-api-retry";
import { parseGcpServiceAccountJson } from "@/lib/server/janitor/gcp-compute-read";

function snapshotDeletePath(
  projectId: string,
  finding: JanitorFinding,
): string {
  const meta = (finding.metricsMeta ?? {}) as {
    snapshotScope?: string;
    region?: string;
  };
  const name = encodeURIComponent(finding.resourceId);
  if (meta.snapshotScope === "regional" && typeof meta.region === "string" && meta.region.trim()) {
    const r = encodeURIComponent(meta.region.trim());
    return `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(projectId)}/regions/${r}/snapshots/${name}`;
  }
  return `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(projectId)}/global/snapshots/${name}`;
}

export async function performGcpLiveCleanup(
  saJson: string,
  finding: JanitorFinding,
): Promise<void> {
  const creds = parseGcpServiceAccountJson(saJson);
  const projectId = creds.project_id as string;

  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/compute"],
  });
  const ac = await auth.getClient();
  const tok = await ac.getAccessToken();
  if (!tok.token) {
    throw new Error("gcp_token_failed");
  }
  const headers = { Authorization: `Bearer ${tok.token}` };

  const rt = finding.resourceType;

  if (rt === "gce_disk") {
    const meta = (finding.metricsMeta ?? {}) as { zone?: string };
    const zone = typeof meta.zone === "string" ? meta.zone.trim() : "";
    if (!zone) throw new Error("gce_disk_zone_required");
    const disk = encodeURIComponent(finding.resourceId);
    const z = encodeURIComponent(zone);
    const p = encodeURIComponent(projectId);
    const url = `https://compute.googleapis.com/compute/v1/projects/${p}/zones/${z}/disks/${disk}`;
    const res = await fetchWithCloudRetry(url, { method: "DELETE", headers, cache: "no-store" });
    if (!res.ok && res.status !== 404) {
      const t = await res.text();
      throw new Error(`gcp_delete_${res.status}:${t.slice(0, 200)}`);
    }
    return;
  }

  if (rt === "gce_snapshot") {
    const url = snapshotDeletePath(projectId, finding);
    const res = await fetchWithCloudRetry(url, { method: "DELETE", headers, cache: "no-store" });
    if (!res.ok && res.status !== 404) {
      const t = await res.text();
      throw new Error(`gcp_delete_${res.status}:${t.slice(0, 200)}`);
    }
    return;
  }

  throw new Error("cleanup_resource_type_unsupported");
}
