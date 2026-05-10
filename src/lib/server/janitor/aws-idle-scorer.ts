/**
 * Heuristic idle scoring for AWS EC2 / EBS (Charon MVP).
 */

import type { AwsEbsSnapshotBrief, AwsEbsVolumeBrief, AwsEc2InstanceBrief } from "./aws-ec2-read";

const EBS_GB_MONTH = 0.10;
const SNAPSHOT_GB_MONTH = 0.05;

/** Very rough on-demand $/mo by instance type — unknown → 30. */
const INSTANCE_TYPE_MONTHLY_USD: Record<string, number> = {
  "t3.micro": 8,
  "t3.small": 16,
  "t3.medium": 32,
  "t3.large": 64,
  "m5.large": 70,
  "m5.xlarge": 140,
};

function daysSince(iso: string | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (Date.now() - t) / 86_400_000);
}

function hasProtectorTag(tags: Record<string, string>, extraLower: string[]): boolean {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(tags)) {
    parts.push(k.toLowerCase(), v.toLowerCase());
  }
  const base = ["production", "prod", "critical", "do-not-delete", "blackglass-protected"];
  const all = new Set([...base, ...extraLower]);
  return parts.some((p) => all.has(p));
}

export function estimateInstanceMonthlyUsd(t: string): number {
  return INSTANCE_TYPE_MONTHLY_USD[t] ?? 30;
}

export function scoreEc2Instance(
  i: AwsEc2InstanceBrief,
  protectExtraLower: string[],
): { idleScore: number; estimatedWasteMonthly: number; metricsMeta: Record<string, unknown> } {
  const monthly = estimateInstanceMonthlyUsd(i.instanceType);
  if (hasProtectorTag(i.tags, protectExtraLower)) {
    return {
      idleScore: 0,
      estimatedWasteMonthly: 0,
      metricsMeta: { protectorTag: true, state: i.state },
    };
  }
  const ageDays = daysSince(i.launchTime);
  let score = 0;
  const state = i.state.toLowerCase();
  if (state === "stopped") score += 55;
  else if (state === "stopping") score += 35;
  if (state === "running") {
    score += 10;
    if (ageDays >= 30) score += 10;
  }
  if (ageDays >= 90) score += 15;
  const idleScore = Math.max(0, Math.min(100, score));
  return {
    idleScore,
    estimatedWasteMonthly: Number(((monthly * idleScore) / 100).toFixed(2)),
    metricsMeta: { state: i.state, ageDays: Math.round(ageDays), type: i.instanceType },
  };
}

export function scoreEbsVolume(
  v: AwsEbsVolumeBrief,
  protectExtraLower: string[],
): { idleScore: number; estimatedWasteMonthly: number; metricsMeta: Record<string, unknown> } {
  const monthly = v.sizeGiB * EBS_GB_MONTH;
  if (hasProtectorTag(v.tags, protectExtraLower)) {
    return { idleScore: 0, estimatedWasteMonthly: 0, metricsMeta: { protectorTag: true } };
  }
  const attached = v.attachments > 0;
  const ageDays = daysSince(v.createTime);
  let score = 0;
  if (!attached && v.state === "available") score += 55;
  if (!attached && ageDays >= 7) score += 20;
  if (!attached && ageDays >= 30) score += 10;
  const idleScore = Math.max(0, Math.min(100, score));
  return {
    idleScore,
    estimatedWasteMonthly: Number(((monthly * idleScore) / 100).toFixed(2)),
    metricsMeta: { attached, ageDays: Math.round(ageDays), az: v.availabilityZone, state: v.state },
  };
}

export function scoreEbsSnapshot(
  s: AwsEbsSnapshotBrief,
  protectExtraLower: string[],
): { idleScore: number; estimatedWasteMonthly: number; metricsMeta: Record<string, unknown> } {
  const monthly = s.sizeGiB * SNAPSHOT_GB_MONTH;
  if (hasProtectorTag(s.tags, protectExtraLower)) {
    return { idleScore: 0, estimatedWasteMonthly: 0, metricsMeta: { protectorTag: true } };
  }
  const ageDays = daysSince(s.startTime);
  let score = 0;
  if (ageDays >= 90) score += 60;
  else if (ageDays >= 30) score += 30;
  const idleScore = Math.max(0, Math.min(100, score));
  return {
    idleScore,
    estimatedWasteMonthly: Number(((monthly * idleScore) / 100).toFixed(2)),
    metricsMeta: { ageDays: Math.round(ageDays), volumeId: s.volumeId },
  };
}
