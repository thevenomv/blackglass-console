/**
 * Live EC2 / EBS deletes for approved Charon cleanup (credentials must allow writes).
 */

import {
  EC2Client,
  DeleteSnapshotCommand,
  DeleteVolumeCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import type { JanitorFinding } from "@/db/schema";
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

export async function performAwsLiveCleanup(
  credsJson: string,
  finding: JanitorFinding,
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
