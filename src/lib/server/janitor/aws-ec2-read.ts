/**
 * Read-only AWS EC2 / EBS inventory for Charon (access-key JSON credentials).
 * Optional `regions` array in JSON scans multiple regions (cap applies).
 */

import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeSnapshotsCommand,
  DescribeVolumesCommand,
} from "@aws-sdk/client-ec2";
import { withAwsRetry } from "@/lib/server/janitor/cloud-api-retry";
import { logStructured } from "@/lib/server/log";

export type AwsEc2InstanceBrief = {
  id: string;
  name: string;
  state: string;
  instanceType: string;
  launchTime?: string;
  tags: Record<string, string>;
  /** EC2 region this instance was listed from. */
  region: string;
};

export type AwsEbsVolumeBrief = {
  id: string;
  name: string;
  sizeGiB: number;
  state: string;
  availabilityZone?: string;
  attachments: number;
  createTime?: string;
  tags: Record<string, string>;
};

export type AwsEbsSnapshotBrief = {
  id: string;
  name: string;
  volumeId: string;
  sizeGiB: number;
  startTime?: string;
  tags: Record<string, string>;
  /** Region of the EC2 client that listed this snapshot (required for delete API). */
  region: string;
};

const MAX_AWS_SCAN_REGIONS = 14;

function tagMap(tags: { Key?: string; Value?: string }[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tags ?? []) {
    if (t.Key) out[t.Key] = t.Value ?? "";
  }
  return out;
}

function nameFromTags(tags: Record<string, string>): string {
  return tags.Name?.trim() || tags.name?.trim() || "(unnamed)";
}

export function parseAwsAccessJson(raw: string): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region?: string;
  regions?: string[];
} {
  const o = JSON.parse(raw) as Record<string, unknown>;
  const accessKeyId = typeof o.accessKeyId === "string" ? o.accessKeyId : "";
  const secretAccessKey = typeof o.secretAccessKey === "string" ? o.secretAccessKey : "";
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("aws_credentials_invalid_shape");
  }
  const sessionToken = typeof o.sessionToken === "string" ? o.sessionToken : undefined;
  const region = typeof o.region === "string" ? o.region : "us-east-1";
  const regionsRaw = o.regions;
  const regions = Array.isArray(regionsRaw)
    ? regionsRaw
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim())
    : undefined;
  return { accessKeyId, secretAccessKey, sessionToken, region, regions };
}

export function resolveAwsScanRegions(parsed: ReturnType<typeof parseAwsAccessJson>): string[] {
  if (parsed.regions && parsed.regions.length > 0) {
    return [...new Set(parsed.regions)].slice(0, MAX_AWS_SCAN_REGIONS);
  }
  return [parsed.region ?? "us-east-1"];
}

async function listAwsEc2InventoryInRegion(
  accessKeyId: string,
  secretAccessKey: string,
  sessionToken: string | undefined,
  region: string,
): Promise<{
  instances: AwsEc2InstanceBrief[];
  volumes: AwsEbsVolumeBrief[];
  snapshots: AwsEbsSnapshotBrief[];
}> {
  const client = new EC2Client({
    region,
    credentials: { accessKeyId, secretAccessKey, sessionToken },
    maxAttempts: 2,
  });

  const [instOut, volOut, snapOut] = await Promise.all([
    withAwsRetry(() => client.send(new DescribeInstancesCommand({}))),
    withAwsRetry(() => client.send(new DescribeVolumesCommand({}))),
    withAwsRetry(() =>
      client.send(
        new DescribeSnapshotsCommand({
          OwnerIds: ["self"],
        }),
      ),
    ),
  ]);

  const instances: AwsEc2InstanceBrief[] = [];
  for (const r of instOut.Reservations ?? []) {
    for (const i of r.Instances ?? []) {
      if (!i.InstanceId) continue;
      const tags = tagMap(i.Tags);
      instances.push({
        id: i.InstanceId,
        name: nameFromTags(tags),
        state: i.State?.Name ?? "unknown",
        instanceType: i.InstanceType ?? "unknown",
        launchTime: i.LaunchTime?.toISOString(),
        tags,
        region,
      });
    }
  }

  const volumes: AwsEbsVolumeBrief[] = [];
  for (const v of volOut.Volumes ?? []) {
    if (!v.VolumeId) continue;
    const tags = tagMap(v.Tags);
    volumes.push({
      id: v.VolumeId,
      name: nameFromTags(tags),
      sizeGiB: v.Size ?? 0,
      state: v.State ?? "unknown",
      availabilityZone: v.AvailabilityZone,
      attachments: v.Attachments?.length ?? 0,
      createTime: v.CreateTime?.toISOString(),
      tags,
    });
  }

  const snapshots: AwsEbsSnapshotBrief[] = [];
  for (const s of snapOut.Snapshots ?? []) {
    if (!s.SnapshotId) continue;
    const tags = tagMap(s.Tags);
    snapshots.push({
      id: s.SnapshotId,
      name: nameFromTags(tags),
      volumeId: s.VolumeId ?? "",
      sizeGiB: s.VolumeSize ?? 0,
      startTime: s.StartTime?.toISOString(),
      tags,
      region,
    });
  }

  return { instances, volumes, snapshots };
}

export async function listAwsEc2Inventory(credsJson: string): Promise<{
  instances: AwsEc2InstanceBrief[];
  volumes: AwsEbsVolumeBrief[];
  snapshots: AwsEbsSnapshotBrief[];
}> {
  const parsed = parseAwsAccessJson(credsJson);
  const regions = resolveAwsScanRegions(parsed);

  const instances: AwsEc2InstanceBrief[] = [];
  const volumes: AwsEbsVolumeBrief[] = [];
  const snapshots: AwsEbsSnapshotBrief[] = [];
  const seenI = new Set<string>();
  const seenV = new Set<string>();
  const seenS = new Set<string>();

  for (const region of regions) {
    try {
      const part = await listAwsEc2InventoryInRegion(
        parsed.accessKeyId,
        parsed.secretAccessKey,
        parsed.sessionToken,
        region,
      );
      for (const i of part.instances) {
        if (seenI.has(i.id)) continue;
        seenI.add(i.id);
        instances.push(i);
      }
      for (const v of part.volumes) {
        if (seenV.has(v.id)) continue;
        seenV.add(v.id);
        volumes.push(v);
      }
      for (const s of part.snapshots) {
        if (seenS.has(s.id)) continue;
        seenS.add(s.id);
        snapshots.push(s);
      }
    } catch (e) {
      logStructured("warn", "aws_charon_region_inventory_failed", {
        region,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { instances, volumes, snapshots };
}
