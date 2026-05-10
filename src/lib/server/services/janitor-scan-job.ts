/**
 * Charon scan execution — invoked from BullMQ ops-worker or inline when Redis is off.
 */

import { and, eq } from "drizzle-orm";
import { withTenantRls } from "@/db";
import { janitorAccounts, janitorFindings, saasTenants } from "@/db/schema";
import { decryptKey, type EncryptedKey } from "@/lib/server/secrets/envelope";
import {
  dropletMetricAverage,
  listDropletSnapshots,
  listDroplets,
  listVolumesAllRegions,
} from "@/lib/server/janitor/do-client";
import { listAwsEc2Inventory } from "@/lib/server/janitor/aws-ec2-read";
import { scoreEbsSnapshot, scoreEbsVolume, scoreEc2Instance } from "@/lib/server/janitor/aws-idle-scorer";
import { listGceInventory, parseGcpServiceAccountJson } from "@/lib/server/janitor/gcp-compute-read";
import { scoreGceDisk, scoreGceSnapshot } from "@/lib/server/janitor/gcp-idle-scorer";
import { scoreDroplet, scoreSnapshot, scoreVolume } from "@/lib/server/janitor/idle-scorer";
import type { JanitorCloudProvider } from "@/lib/janitor/providers";
import { janitorProviderScanImplemented } from "@/lib/janitor/providers";
import {
  findingMatchesExcludeTags,
  findingMatchesProtectTags,
  parseCharonPolicies,
} from "@/lib/janitor/charon-policies";
import { maybeSendCharonScanDigest } from "@/lib/server/services/charon-scan-digest";
import {
  filterFindingsBySuppressions,
  listJanitorSuppressions,
} from "@/lib/server/services/janitor-suppression-service";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { logStructured } from "@/lib/server/log";
import type { JanitorScanJobPayload } from "@/lib/server/queue/janitor-queue";
import { redactSensitivePlaintext } from "@/lib/janitor/charon-error-redact";
import {
  buildCharonScanSnapshot,
  diffCharonScanSnapshots,
  parseCharonScanSnapshot,
} from "@/lib/janitor/charon-scan-diff";
import { maybeDispatchCharonScanWebhook } from "@/lib/server/services/charon-scan-webhook";

function parseEncryptedKey(raw: string): EncryptedKey {
  const trimmed = raw.trim();
  const parsed = JSON.parse(trimmed) as EncryptedKey;
  if (!parsed?.ciphertext || parsed.wrappedDek === undefined || !parsed.kmsProvider) {
    throw new Error("invalid_encrypted_key_blob");
  }
  return parsed;
}

async function decryptApiToken(tenantId: string, encryptedApiKey: string): Promise<string> {
  const enc = parseEncryptedKey(encryptedApiKey);
  const buf = await decryptKey(tenantId, enc);
  try {
    return buf.toString("utf8").trim();
  } finally {
    buf.fill(0);
  }
}

async function loadTenantPolicyAndName(
  tenantId: string,
): Promise<{ policy: ReturnType<typeof parseCharonPolicies>; workspaceName: string }> {
  const [row] = await withTenantRls(tenantId, (db) =>
    db
      .select({ charonPolicies: saasTenants.charonPolicies, name: saasTenants.name })
      .from(saasTenants)
      .where(eq(saasTenants.id, tenantId))
      .limit(1),
  );
  return {
    policy: parseCharonPolicies(row?.charonPolicies),
    workspaceName: row?.name ?? "workspace",
  };
}

function applyTenantPolicies(
  rows: (typeof janitorFindings.$inferInsert)[],
  policy: ReturnType<typeof parseCharonPolicies>,
): (typeof janitorFindings.$inferInsert)[] {
  return rows.filter((row) => {
    if (policy.minIdleScore != null && row.idleScore < policy.minIdleScore) return false;
    if (findingMatchesExcludeTags(row.tags ?? undefined, policy.excludeTagsLower)) return false;
    if (findingMatchesProtectTags(row.tags ?? undefined, policy.protectTagsExtraLower)) return false;
    return true;
  });
}

async function finalizeScan(
  tenantId: string,
  accountId: string,
  findingRows: (typeof janitorFindings.$inferInsert)[],
  snapshot: ReturnType<typeof buildCharonScanSnapshot>,
  diff: ReturnType<typeof diffCharonScanSnapshots>,
): Promise<void> {
  await withTenantRls(tenantId, async (db) => {
    await db.delete(janitorFindings).where(eq(janitorFindings.accountId, accountId));
    if (findingRows.length > 0) {
      await db.insert(janitorFindings).values(findingRows);
    }
    await db
      .update(janitorAccounts)
      .set({
        lastScanAt: new Date(),
        lastScanStatus: "ok",
        lastScanError: null,
        lastScanSnapshot: snapshot,
        lastScanDiff: diff,
        updatedAt: new Date(),
      })
      .where(eq(janitorAccounts.id, accountId));
  });
}

async function recordScanFailure(tenantId: string, accountId: string, message: string): Promise<void> {
  const truncated = redactSensitivePlaintext(message, 2000);
  await withTenantRls(tenantId, async (db) => {
    await db
      .update(janitorAccounts)
      .set({
        lastScanStatus: "failed",
        lastScanError: truncated,
        updatedAt: new Date(),
      })
      .where(eq(janitorAccounts.id, accountId));
  });
}

async function executeDigitalOceanScan(
  tenantId: string,
  accountId: string,
  encryptedApiKey: string,
  protectExtra: string[],
): Promise<(typeof janitorFindings.$inferInsert)[]> {
  const token = await decryptApiToken(tenantId, encryptedApiKey);
  const endSec = Math.floor(Date.now() / 1000);
  const startSec = endSec - 7 * 86_400;

  const droplets = await listDroplets(token);
  const volumes = await listVolumesAllRegions(token);
  const snapshots = await listDropletSnapshots(token);

  const findingRows: (typeof janitorFindings.$inferInsert)[] = [];

  for (const d of droplets) {
    const [avgCpu, avgNet] = await Promise.all([
      dropletMetricAverage(token, d.id, "cpu", startSec, endSec, 3600),
      dropletMetricAverage(token, d.id, "network_tx", startSec, endSec, 3600),
    ]);
    const { idleScore, estimatedWasteMonthly, metricsMeta } = scoreDroplet({
      droplet: d,
      avgCpuPercent: avgCpu,
      avgNetworkTx: avgNet,
    });
    if (idleScore <= 0) continue;
    const tags = Object.fromEntries((d.tags ?? []).map((t) => [t, "true"]));
    if (findingMatchesProtectTags(tags, protectExtra)) continue;
    findingRows.push({
      tenantId,
      accountId,
      resourceType: "droplet",
      resourceId: String(d.id),
      resourceName: d.name,
      idleScore,
      estimatedWasteMonthly: String(estimatedWasteMonthly),
      tags,
      metricsMeta,
    });
  }

  for (const v of volumes) {
    const { idleScore, estimatedWasteMonthly, metricsMeta } = scoreVolume(v);
    if (idleScore <= 0) continue;
    findingRows.push({
      tenantId,
      accountId,
      resourceType: "volume",
      resourceId: v.id,
      resourceName: v.name,
      idleScore,
      estimatedWasteMonthly: String(estimatedWasteMonthly),
      tags: undefined,
      metricsMeta,
    });
  }

  for (const s of snapshots) {
    const { idleScore, estimatedWasteMonthly, metricsMeta } = scoreSnapshot(s);
    if (idleScore <= 0) continue;
    const tags = s.tags ? Object.fromEntries(s.tags.map((t) => [t, "true"])) : undefined;
    if (findingMatchesProtectTags(tags, protectExtra)) continue;
    findingRows.push({
      tenantId,
      accountId,
      resourceType: "snapshot",
      resourceId: s.id,
      resourceName: s.name,
      idleScore,
      estimatedWasteMonthly: String(estimatedWasteMonthly),
      tags,
      metricsMeta,
    });
  }

  return findingRows;
}

async function executeAwsScan(
  tenantId: string,
  accountId: string,
  credsRaw: string,
  protectExtra: string[],
): Promise<(typeof janitorFindings.$inferInsert)[]> {
  const { instances, volumes, snapshots } = await listAwsEc2Inventory(credsRaw);
  const findingRows: (typeof janitorFindings.$inferInsert)[] = [];

  for (const i of instances) {
    const { idleScore, estimatedWasteMonthly, metricsMeta } = scoreEc2Instance(i, protectExtra);
    if (idleScore <= 0) continue;
    const tagsFlat: Record<string, string> = {};
    for (const [k, v] of Object.entries(i.tags)) tagsFlat[k] = v;
    findingRows.push({
      tenantId,
      accountId,
      resourceType: "ec2_instance",
      resourceId: i.id,
      resourceName: i.name,
      idleScore,
      estimatedWasteMonthly: String(estimatedWasteMonthly),
      tags: tagsFlat,
      metricsMeta: { ...metricsMeta, region: i.region },
    });
  }

  for (const v of volumes) {
    const { idleScore, estimatedWasteMonthly, metricsMeta } = scoreEbsVolume(v, protectExtra);
    if (idleScore <= 0) continue;
    const tagsFlat: Record<string, string> = {};
    for (const [k, val] of Object.entries(v.tags)) tagsFlat[k] = val;
    const region =
      v.availabilityZone && v.availabilityZone.length > 1
        ? v.availabilityZone.replace(/[a-z]$/, "")
        : undefined;
    findingRows.push({
      tenantId,
      accountId,
      resourceType: "ebs_volume",
      resourceId: v.id,
      resourceName: v.name,
      idleScore,
      estimatedWasteMonthly: String(estimatedWasteMonthly),
      tags: tagsFlat,
      metricsMeta: { ...metricsMeta, region },
    });
  }

  for (const s of snapshots) {
    const { idleScore, estimatedWasteMonthly, metricsMeta } = scoreEbsSnapshot(s, protectExtra);
    if (idleScore <= 0) continue;
    const tagsFlat: Record<string, string> = {};
    for (const [k, val] of Object.entries(s.tags)) tagsFlat[k] = val;
    findingRows.push({
      tenantId,
      accountId,
      resourceType: "ebs_snapshot",
      resourceId: s.id,
      resourceName: s.name,
      idleScore,
      estimatedWasteMonthly: String(estimatedWasteMonthly),
      tags: tagsFlat,
      metricsMeta: { ...metricsMeta, region: s.region },
    });
  }

  return findingRows;
}

async function executeGcpScan(
  tenantId: string,
  accountId: string,
  saJson: string,
  protectExtra: string[],
  gcpProjectId?: string,
): Promise<(typeof janitorFindings.$inferInsert)[]> {
  const { disks, snapshots } = await listGceInventory(saJson);
  const findingRows: (typeof janitorFindings.$inferInsert)[] = [];

  for (const d of disks) {
    const { idleScore, estimatedWasteMonthly, metricsMeta } = scoreGceDisk(d, protectExtra);
    if (idleScore <= 0) continue;
    findingRows.push({
      tenantId,
      accountId,
      resourceType: "gce_disk",
      resourceId: d.name,
      resourceName: d.name,
      idleScore,
      estimatedWasteMonthly: String(estimatedWasteMonthly),
      tags: d.labels,
      metricsMeta: {
        ...metricsMeta,
        numericResourceId: d.id,
        ...(gcpProjectId ? { gcpProjectId } : {}),
      },
    });
  }

  for (const s of snapshots) {
    const { idleScore, estimatedWasteMonthly, metricsMeta } = scoreGceSnapshot(s, protectExtra);
    if (idleScore <= 0) continue;
    findingRows.push({
      tenantId,
      accountId,
      resourceType: "gce_snapshot",
      resourceId: s.name,
      resourceName: s.name,
      idleScore,
      estimatedWasteMonthly: String(estimatedWasteMonthly),
      tags: s.labels,
      metricsMeta: {
        ...metricsMeta,
        numericResourceId: s.id,
        ...(gcpProjectId ? { gcpProjectId } : {}),
      },
    });
  }

  return findingRows;
}

export async function executeJanitorScanJob(payload: JanitorScanJobPayload): Promise<void> {
  const { tenantId, accountId, requestId, actorUserId } = payload;
  const started = Date.now();

  try {
    const { policy, workspaceName } = await loadTenantPolicyAndName(tenantId);

    const rows = await withTenantRls(tenantId, (db) =>
      db
        .select()
        .from(janitorAccounts)
        .where(and(eq(janitorAccounts.id, accountId), eq(janitorAccounts.tenantId, tenantId)))
        .limit(1),
    );
    const account = rows[0];
    if (!account) {
      throw new Error("janitor_account_not_found");
    }

    const provider = account.provider as JanitorCloudProvider;
    const protectExtra = policy.protectTagsExtraLower;

    let rawFindingRows: (typeof janitorFindings.$inferInsert)[] = [];

    if (!janitorProviderScanImplemented(provider)) {
      rawFindingRows = [];
    } else if (provider === "do") {
      rawFindingRows = await executeDigitalOceanScan(
        tenantId,
        accountId,
        account.encryptedApiKey,
        protectExtra,
      );
    } else if (provider === "aws") {
      const creds = await decryptApiToken(tenantId, account.encryptedApiKey);
      rawFindingRows = await executeAwsScan(tenantId, accountId, creds, protectExtra);
    } else if (provider === "gcp") {
      const creds = await decryptApiToken(tenantId, account.encryptedApiKey);
      let gcpProjectId: string | undefined;
      try {
        gcpProjectId = parseGcpServiceAccountJson(creds).project_id as string;
      } catch {
        gcpProjectId = undefined;
      }
      rawFindingRows = await executeGcpScan(
        tenantId,
        accountId,
        creds,
        protectExtra,
        gcpProjectId,
      );
    }

    const policyRows = applyTenantPolicies(rawFindingRows, policy);
    const suppressions = await listJanitorSuppressions(tenantId, accountId);
    const now = new Date();
    const findingRows = filterFindingsBySuppressions(policyRows, suppressions, now);

    const snapshotTs = new Date();
    const currentSnapshot = buildCharonScanSnapshot(
      snapshotTs,
      findingRows.map((f) => ({
        resourceType: f.resourceType,
        resourceId: f.resourceId,
        resourceName: f.resourceName,
        idleScore: f.idleScore,
      })),
    );
    const previousSnapshot = parseCharonScanSnapshot(account.lastScanSnapshot);
    const scanDiff = diffCharonScanSnapshots(previousSnapshot, currentSnapshot);

    await finalizeScan(tenantId, accountId, findingRows, currentSnapshot, scanDiff);

    void maybeSendCharonScanDigest(
      tenantId,
      workspaceName,
      findingRows.map((f) => ({
        idleScore: f.idleScore,
        resourceType: f.resourceType,
        resourceName: f.resourceName,
      })),
      policy,
    );

    logStructured("info", "janitor_scan_completed", {
      tenantId,
      accountId,
      provider,
      findingsRaw: rawFindingRows.length,
      findingsAfterPolicy: policyRows.length,
      findings: findingRows.length,
      suppressionsActive: suppressions.length,
      diffAdded: scanDiff.counts.added,
      diffRemoved: scanDiff.counts.removed,
      diffScoreChanged: scanDiff.counts.scoreChanged,
      elapsedMs: Date.now() - started,
    });

    void maybeDispatchCharonScanWebhook({
      tenantId,
      accountId,
      provider: account.provider,
      policy,
      scanId: `charon-${accountId}-${snapshotTs.getTime()}`,
      findingsCount: findingRows.length,
      diff: scanDiff,
    });

    await emitSaasAudit({
      tenantId,
      actorUserId: actorUserId ?? null,
      action: "janitor.scan.completed",
      targetType: "janitor_account",
      targetId: accountId,
      metadata: {
        ...(requestId ? { request_id: requestId } : {}),
        findings: findingRows.length,
        provider: account.provider,
        diff: scanDiff.counts,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logStructured("error", "janitor_scan_failed", {
      tenantId,
      accountId,
      error: message,
      elapsedMs: Date.now() - started,
    });
    if (message !== "janitor_account_not_found") {
      await recordScanFailure(tenantId, accountId, message);
      await emitSaasAudit({
        tenantId,
        actorUserId: actorUserId ?? null,
        action: "janitor.scan.failed",
        targetType: "janitor_account",
        targetId: accountId,
        metadata: {
          ...(requestId ? { request_id: requestId } : {}),
          error: message.slice(0, 500),
        },
      });
    }
    throw err;
  }
}
