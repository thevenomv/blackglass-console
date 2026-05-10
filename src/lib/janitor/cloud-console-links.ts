/**
 * Build vendor console URLs for Charon findings (best-effort; regions/projects must be in metrics_meta).
 */

export type JanitorConsoleLinkInput = {
  provider: string;
  resourceType: string;
  resourceId: string;
  metricsMeta: Record<string, unknown> | null | undefined;
};

function str(meta: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function janitorFindingConsoleUrl(input: JanitorConsoleLinkInput): string | null {
  const { provider, resourceType, resourceId, metricsMeta } = input;

  if (provider === "do") {
    if (resourceType === "droplet") {
      const id = resourceId.trim();
      if (!/^\d+$/.test(id)) return null;
      return `https://cloud.digitalocean.com/droplets/${id}`;
    }
    if (resourceType === "volume") {
      const region = str(metricsMeta, "region");
      if (!region) return "https://cloud.digitalocean.com/droplets/volumes";
      return `https://cloud.digitalocean.com/droplets/volumes?region=${encodeURIComponent(region)}`;
    }
    if (resourceType === "snapshot") {
      return `https://cloud.digitalocean.com/images/snapshots/${encodeURIComponent(resourceId)}`;
    }
    return null;
  }

  if (provider === "aws") {
    const region = str(metricsMeta, "region") ?? "us-east-1";
    const r = encodeURIComponent(region);
    if (resourceType === "ec2_instance") {
      const id = encodeURIComponent(resourceId);
      return `https://${region}.console.aws.amazon.com/ec2/home?region=${r}#InstanceDetails:instanceId=${id}`;
    }
    if (resourceType === "ebs_volume") {
      const id = encodeURIComponent(resourceId);
      return `https://${region}.console.aws.amazon.com/ec2/home?region=${r}#VolumeDetails:volumeId=${id}`;
    }
    if (resourceType === "ebs_snapshot") {
      const id = encodeURIComponent(resourceId);
      return `https://${region}.console.aws.amazon.com/ec2/home?region=${r}#SnapshotDetails:snapshotId=${id}`;
    }
    return null;
  }

  if (provider === "gcp") {
    const project = str(metricsMeta, "gcpProjectId");
    if (!project) return "https://console.cloud.google.com/compute/disks";
    const p = encodeURIComponent(project);

    if (resourceType === "gce_disk") {
      const zone = str(metricsMeta, "zone");
      if (!zone) return `https://console.cloud.google.com/compute/disks?project=${p}`;
      const z = encodeURIComponent(zone);
      const disk = encodeURIComponent(resourceId);
      return `https://console.cloud.google.com/compute/disksDetail/zones/${z}/disks/${disk}?project=${p}`;
    }
    if (resourceType === "gce_snapshot") {
      const scope = str(metricsMeta, "snapshotScope");
      const reg = str(metricsMeta, "region");
      if (scope === "regional" && reg) {
        const snap = encodeURIComponent(resourceId);
        const regionEnc = encodeURIComponent(reg);
        return `https://console.cloud.google.com/compute/snapshotsDetail/regions/${regionEnc}/snapshots/${snap}?project=${p}`;
      }
      const snap = encodeURIComponent(resourceId);
      return `https://console.cloud.google.com/compute/snapshotsDetail/projects/${p}/global/snapshots/${snap}?project=${p}`;
    }
    return null;
  }

  return null;
}
