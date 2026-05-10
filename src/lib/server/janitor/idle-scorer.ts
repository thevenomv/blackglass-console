/**
 * Heuristic idle scoring for Charon (MVP). Metrics-aware when DO Monitoring
 * returns data; otherwise confidence is capped and scoring is age/tag based.
 */

import type { DoDroplet, DoSnapshot, DoVolume } from "./do-client";
import { CHARON_BUILTIN_PROTECT_MARKERS_LOWER } from "@/lib/janitor/charon-policies";

/** Approximate droplet $/mo by size slug (USD). Unknown sizes → conservative default. */
const DROPLET_SIZE_MONTHLY_USD: Record<string, number> = {
  "s-1vcpu-512mb": 4,
  "s-1vcpu-1gb": 6,
  "s-1vcpu-2gb": 12,
  "s-2vcpu-2gb": 18,
  "s-2vcpu-4gb": 24,
  "s-4vcpu-8gb": 48,
  "g-2vcpu-8gb": 60,
  "g-4vcpu-16gb": 120,
  "c-2": 42,
  "c-4": 84,
  "m-2vcpu-16gb": 90,
};

const DO_BLOCK_STORAGE_PER_GB = 0.12;
const SNAPSHOT_PER_GB = 0.06;

export function estimateDropletMonthlyUsd(sizeSlug: string): number {
  return DROPLET_SIZE_MONTHLY_USD[sizeSlug] ?? 24;
}

export function estimateVolumeMonthlyUsd(v: DoVolume): number {
  return v.size_gigabytes * DO_BLOCK_STORAGE_PER_GB;
}

export function estimateSnapshotMonthlyUsd(s: DoSnapshot): number {
  return s.size_gigabytes * SNAPSHOT_PER_GB;
}

function daysSince(iso: string | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (Date.now() - t) / 86_400_000);
}

function hasProtectorTag(tags: string[] | undefined): boolean {
  if (!tags?.length) return false;
  const lower = tags.map((t) => t.toLowerCase());
  return lower.some((t) =>
    (CHARON_BUILTIN_PROTECT_MARKERS_LOWER as readonly string[]).includes(t),
  );
}

export type DropletScoreInput = {
  droplet: DoDroplet;
  avgCpuPercent: number | null;
  avgNetworkTx: number | null;
};

export function scoreDroplet(input: DropletScoreInput): {
  idleScore: number;
  estimatedWasteMonthly: number;
  metricsMeta: Record<string, unknown>;
} {
  const { droplet, avgCpuPercent, avgNetworkTx } = input;
  const monthly = estimateDropletMonthlyUsd(droplet.size_slug);
  const ageDays = daysSince(droplet.created_at);
  const protector = hasProtectorTag(droplet.tags);

  let score = 0;
  const metricsOk = avgCpuPercent !== null && avgNetworkTx !== null;
  const meta: Record<string, unknown> = {
    ageDays: Math.round(ageDays),
    metricsOk,
    avgCpuPercent,
    avgNetworkTx,
    status: droplet.status,
    protectorTag: protector,
  };

  if (protector) {
    return { idleScore: 0, estimatedWasteMonthly: 0, metricsMeta: meta };
  }

  if (droplet.status !== "active") {
    score += 15;
  }

  if (metricsOk) {
    if (avgCpuPercent! < 5) score += 35;
    else if (avgCpuPercent! < 15) score += 15;
    if (avgNetworkTx! < 1024 * 1024) score += 25;
    else if (avgNetworkTx! < 10 * 1024 * 1024) score += 10;
  } else {
    score += Math.min(25, Math.floor(ageDays / 3));
    score = Math.min(score, 45);
    meta.degraded = "metrics_unavailable";
  }

  if (ageDays >= 14) score += 15;
  if (ageDays >= 30) score += 10;
  if (ageDays >= 90) score += 5;

  const idleScore = Math.max(0, Math.min(100, score));
  const estimatedWasteMonthly = Number(((monthly * idleScore) / 100).toFixed(2));
  return { idleScore, estimatedWasteMonthly, metricsMeta: meta };
}

export function scoreVolume(vol: DoVolume): {
  idleScore: number;
  estimatedWasteMonthly: number;
  metricsMeta: Record<string, unknown>;
} {
  const monthly = estimateVolumeMonthlyUsd(vol);
  const attached = (vol.droplet_ids?.length ?? 0) > 0;
  const ageDays = daysSince(vol.created_at);
  let score = 0;
  if (!attached) score += 55;
  if (ageDays >= 7 && !attached) score += 25;
  if (ageDays >= 30 && !attached) score += 10;
  const idleScore = Math.max(0, Math.min(100, score));
  return {
    idleScore,
    estimatedWasteMonthly: Number(((monthly * idleScore) / 100).toFixed(2)),
    metricsMeta: { attached, ageDays: Math.round(ageDays), region: vol.region?.slug },
  };
}

export function scoreSnapshot(snap: DoSnapshot): {
  idleScore: number;
  estimatedWasteMonthly: number;
  metricsMeta: Record<string, unknown>;
} {
  const monthly = estimateSnapshotMonthlyUsd(snap);
  const ageDays = daysSince(snap.created_at);
  let score = 0;
  if (ageDays >= 90) score += 60;
  else if (ageDays >= 30) score += 25;
  if (hasProtectorTag(snap.tags)) {
    return {
      idleScore: 0,
      estimatedWasteMonthly: 0,
      metricsMeta: { ageDays: Math.round(ageDays), protectorTag: true },
    };
  }
  const idleScore = Math.max(0, Math.min(100, score));
  return {
    idleScore,
    estimatedWasteMonthly: Number(((monthly * idleScore) / 100).toFixed(2)),
    metricsMeta: { ageDays: Math.round(ageDays), resourceId: snap.resource_id },
  };
}
