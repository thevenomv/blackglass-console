/**
 * Heuristic idle scoring for GCE disks / snapshots (Charon MVP).
 */

import type { GceDiskBrief, GceSnapshotBrief } from "./gcp-compute-read";

const DISK_GB_MONTH = 0.17;
const SNAPSHOT_GB_MONTH = 0.05;

function daysSince(iso: string | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (Date.now() - t) / 86_400_000);
}

function labelProtector(labels: Record<string, string>, extraLower: string[]): boolean {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(labels)) {
    parts.push(k.toLowerCase(), v.toLowerCase());
  }
  const base = ["production", "prod", "critical", "do-not-delete", "blackglass-protected"];
  const all = new Set([...base, ...extraLower]);
  return parts.some((p) => all.has(p));
}

export function scoreGceDisk(
  d: GceDiskBrief,
  protectExtraLower: string[],
): { idleScore: number; estimatedWasteMonthly: number; metricsMeta: Record<string, unknown> } {
  const monthly = d.sizeGb * DISK_GB_MONTH;
  if (labelProtector(d.labels, protectExtraLower)) {
    return { idleScore: 0, estimatedWasteMonthly: 0, metricsMeta: { protectorTag: true } };
  }
  const attached = (d.users?.length ?? 0) > 0;
  const ageDays = daysSince(d.creationTimestamp);
  let score = 0;
  if (!attached) score += 55;
  if (!attached && ageDays >= 7) score += 20;
  if (!attached && ageDays >= 30) score += 10;
  const idleScore = Math.max(0, Math.min(100, score));
  return {
    idleScore,
    estimatedWasteMonthly: Number(((monthly * idleScore) / 100).toFixed(2)),
    metricsMeta: { attached, ageDays: Math.round(ageDays), zone: d.zone },
  };
}

export function scoreGceSnapshot(
  s: GceSnapshotBrief,
  protectExtraLower: string[],
): { idleScore: number; estimatedWasteMonthly: number; metricsMeta: Record<string, unknown> } {
  const monthly = s.diskSizeGb * SNAPSHOT_GB_MONTH;
  if (labelProtector(s.labels, protectExtraLower)) {
    return { idleScore: 0, estimatedWasteMonthly: 0, metricsMeta: { protectorTag: true } };
  }
  const ageDays = daysSince(s.creationTimestamp);
  let score = 0;
  if (ageDays >= 90) score += 60;
  else if (ageDays >= 30) score += 30;
  const idleScore = Math.max(0, Math.min(100, score));
  return {
    idleScore,
    estimatedWasteMonthly: Number(((monthly * idleScore) / 100).toFixed(2)),
    metricsMeta: {
      ageDays: Math.round(ageDays),
      snapshotScope: s.snapshotScope,
      ...(s.region ? { region: s.region } : {}),
    },
  };
}
