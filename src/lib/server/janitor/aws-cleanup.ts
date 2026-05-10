/**
 * Live EC2 / EBS deletes for approved Charon cleanup (credentials must allow writes).
 */

import {
  EC2Client,
  DeleteSnapshotCommand,
  DeleteVolumeCommand,
  DescribeInstancesCommand,
  DescribeSnapshotsCommand,
  DescribeVolumesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import type { JanitorFinding } from "@/db/schema";
import { findingMatchesProtectTags, recordFromAwsEc2Tags } from "@/lib/janitor/charon-policies";
import { JanitorCleanupBlockedError } from "@/lib/server/janitor/janitor-cleanup-blocked-error";
import { parseAwsAccessJson } from "@/lib/server/janitor/aws-ec2-read";
import { withAwsRetry } from "@/lib/server/janitor/cloud-api-retry";

function isEc2AlreadyGone(err: unknown): boolean {
  const e = err as { name?: string; message?: string };
  const n = e.name ?? "";
  if (
    n.includes("NotFound") ||
    n === "InvalidInstanceID.NotFound" ||
    n === "InvalidVolume.NotFound" ||
    n === "InvalidSnapshot.NotFound"
  ) {
    return true;
  }
  const m = e.message ?? "";
  return /\bnot\s+found\b/i.test(m) || /does not exist/i.test(m);
}

async function sendIgnoreNotFound(fn: () => Promise<unknown>): Promise<void> {
  try {
    await withAwsRetry(fn);
  } catch (e) {
    if (!isEc2AlreadyGone(e)) throw e;
  }
}

type Ec2Tag = { Key?: string; Value?: string };

function assertAwsLiveNotProtected(tags: Ec2Tag[] | undefined, markers: string[]): void {
  const rec = recordFromAwsEc2Tags(tags);
  if (findingMatchesProtectTags(rec, markers)) {
    throw new JanitorCleanupBlockedError();
  }
}

async function readEc2InstanceTags(client: EC2Client, instanceId: string): Promise<Ec2Tag[] | undefined> {
  try {
    const out = await withAwsRetry(() =>
      client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] })),
    );
    const inst = out.Reservations?.flatMap((r) => r.Instances ?? []).find((i) => i.InstanceId === instanceId);
    return inst?.Tags;
  } catch (e) {
    if (isEc2AlreadyGone(e)) return undefined;
    throw e;
  }
}

async function readEc2VolumeTags(client: EC2Client, volumeId: string): Promise<Ec2Tag[] | undefined> {
  try {
    const out = await withAwsRetry(() =>
      client.send(new DescribeVolumesCommand({ VolumeIds: [volumeId] })),
    );
    return out.Volumes?.[0]?.Tags;
  } catch (e) {
    if (isEc2AlreadyGone(e)) return undefined;
    throw e;
  }
}

async function readEc2SnapshotTags(client: EC2Client, snapshotId: string): Promise<Ec2Tag[] | undefined> {
  try {
    const out = await withAwsRetry(() =>
      client.send(new DescribeSnapshotsCommand({ SnapshotIds: [snapshotId] })),
    );
    return out.Snapshots?.[0]?.Tags;
  } catch (e) {
    if (isEc2AlreadyGone(e)) return undefined;
    throw e;
  }
}

export async function performAwsLiveCleanup(
  credsJson: string,
  finding: JanitorFinding,
  protectMarkersLower: string[],
): Promise<void> {
  const parsed = parseAwsAccessJson(credsJson);
  const meta = (finding.metricsMeta ?? {}) as { region?: string };
  const region =
    typeof meta.region === "string" && meta.region.trim()
      ? meta.region.trim()
      : (parsed.region ?? "us-east-1");

  const client = new EC2Client({
    region,
    credentials: {
      accessKeyId: parsed.accessKeyId,
      secretAccessKey: parsed.secretAccessKey,
      sessionToken: parsed.sessionToken,
    },
    maxAttempts: 2,
  });

  const rt = finding.resourceType;

  if (rt === "ec2_instance") {
    const tags = await readEc2InstanceTags(client, finding.resourceId);
    assertAwsLiveNotProtected(tags, protectMarkersLower);
    await sendIgnoreNotFound(() =>
      client.send(
        new TerminateInstancesCommand({
          InstanceIds: [finding.resourceId],
        }),
      ),
    );
    return;
  }

  if (rt === "ebs_volume") {
    const tags = await readEc2VolumeTags(client, finding.resourceId);
    assertAwsLiveNotProtected(tags, protectMarkersLower);
    await sendIgnoreNotFound(() =>
      client.send(
        new DeleteVolumeCommand({
          VolumeId: finding.resourceId,
        }),
      ),
    );
    return;
  }

  if (rt === "ebs_snapshot") {
    const tags = await readEc2SnapshotTags(client, finding.resourceId);
    assertAwsLiveNotProtected(tags, protectMarkersLower);
    await sendIgnoreNotFound(() =>
      client.send(
        new DeleteSnapshotCommand({
          SnapshotId: finding.resourceId,
        }),
      ),
    );
    return;
  }

  throw new Error("cleanup_resource_type_unsupported");
}
