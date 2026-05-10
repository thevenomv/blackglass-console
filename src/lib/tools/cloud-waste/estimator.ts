/**
 * Free Cloud Waste Estimator — pure, browser-safe logic.
 *
 * This module powers the public `/tools/cloud-waste-estimator` page. It is a
 * **pre-scan planning tool** aligned with Charon's mental model: same broad
 * categories (idle compute, orphaned volumes, old snapshots), rough
 * self-reported inputs, no credentials, no live resource access.
 *
 * Design boundaries
 * -----------------
 * The price tables, recovery fractions, and confidence bands here are
 * intentionally approximate and calibrated for directional usefulness only.
 * They are not the production heuristics that Charon uses for real cloud
 * scans, and they are not shared with the paid engine:
 *
 *   - Prices are rounded list-price ballparks per provider/size, well within
 *     published ranges. Real bills depend on instance type, region,
 *     reservations, and savings-plan coverage — none of that is observable
 *     without API keys, so we don't pretend to model it.
 *   - Recovery fractions (idle-safe-to-remove %, ghost-volume %, snapshot
 *     weighting by age) are designed for educational estimation, not
 *     production-grade classification. A wide ± band (`UNCERTAINTY_FRACTION`)
 *     is always applied so the user sees a range, never a falsely precise
 *     number.
 *   - We do not publish Charon's actual classification thresholds, sample
 *     windows, suppression rules, or scoring weights.
 *
 * Adjusting any constant here is safe — the public page will reflect it on
 * the next page load. Keep the numbers conservative; readers should leave
 * thinking "I should investigate," not "you owe me $X."
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Provider = "do" | "aws" | "gcp";

export const PROVIDER_LABELS: Record<Provider, string> = {
  do: "DigitalOcean",
  aws: "AWS",
  gcp: "Google Cloud",
};

export type InstanceSize = "small" | "medium" | "large";

export const INSTANCE_SIZE_LABELS: Record<InstanceSize, string> = {
  small: "Small (~2 vCPU)",
  medium: "Medium (~4 vCPU)",
  large: "Large (~8+ vCPU)",
};

/** Per-provider raw counts the user enters. */
export interface ProviderInput {
  provider: Provider;
  /** Running compute counts by approximate size. */
  instances: Record<InstanceSize, number>;
  /** What the user thinks is idle / under-utilised, expressed as 0–100. */
  idlePercent: number;
  /** Block storage volumes attached to running instances. */
  attachedVolumes: number;
  /** Block storage volumes NOT attached to anything (the "ghost" pool). */
  unattachedVolumes: number;
  /** Snapshots older than ~30 days. */
  snapshotsOlder30d: number;
  /** Snapshots older than ~90 days. */
  snapshotsOlder90d: number;
  /**
   * Optional cost overrides. When present, replace the provider's defaults
   * for that provider only. Values are USD/month — caller can use any
   * currency it likes if it stays consistent.
   */
  costOverrides?: Partial<{
    instance: Record<InstanceSize, number>;
    volumePerGbMonth: number;
    snapshotPerGbMonth: number;
    /** Average GB attached per volume / per snapshot — used to convert counts. */
    avgVolumeGb: number;
    avgSnapshotGb: number;
  }>;
}

export interface EstimatorInput {
  providers: ProviderInput[];
}

export type RiskBand = "low" | "medium" | "high";

export interface Range {
  low: number;
  high: number;
}

export interface CategoryEstimate {
  /** Category-level point estimate (USD/month). */
  point: number;
  /** Banded range — point ± uncertainty, floored at 0. */
  range: Range;
  /** Plain-language explanation a reader can sanity-check. */
  rationale: string;
}

export interface EstimateBreakdown {
  idleCompute: CategoryEstimate;
  orphanedVolumes: CategoryEstimate;
  oldSnapshots: CategoryEstimate;
}

export interface EstimateResult {
  total: CategoryEstimate;
  breakdown: EstimateBreakdown;
  riskBand: RiskBand;
  /** Provider list seen in the input — convenient for rendering. */
  providersSeen: Provider[];
  /** Hints surfaced under the result; never include internal-only thresholds. */
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Defaults — public-safe ballpark prices
// ---------------------------------------------------------------------------

/**
 * USD/month ballpark for "a typical Linux instance of this size." These are
 * deliberately rough public-list-price estimates — they will NEVER match a
 * specific SKU exactly and that is fine for an estimator.
 */
export const DEFAULT_INSTANCE_COST: Record<Provider, Record<InstanceSize, number>> = {
  do: { small: 18, medium: 48, large: 96 },
  aws: { small: 30, medium: 70, large: 150 },
  gcp: { small: 28, medium: 65, large: 140 },
};

/** USD per GB-month for general-purpose block storage. Rounded. */
export const DEFAULT_VOLUME_COST_PER_GB: Record<Provider, number> = {
  do: 0.1,
  aws: 0.1,
  gcp: 0.1,
};

/** USD per GB-month for snapshot storage. Rounded. */
export const DEFAULT_SNAPSHOT_COST_PER_GB: Record<Provider, number> = {
  do: 0.06,
  aws: 0.05,
  gcp: 0.05,
};

/** Heuristic average sizes when the user only gives counts. */
export const DEFAULT_AVG_VOLUME_GB = 100;
export const DEFAULT_AVG_SNAPSHOT_GB = 40;

/**
 * Of the user's "idle %" estimate, what fraction is realistically safe to
 * remove after manual verification? Conservative on purpose — we never
 * claim 100% of self-reported idle is recoverable.
 */
export const SAFE_IDLE_RECOVERY_FRACTION = 0.65;

/**
 * Of unattached volumes, what fraction is typically genuinely abandoned
 * vs intentionally detached for migration / staging? Directional ballpark
 * for a planning tool; the paid scanner uses real attach history instead.
 */
export const ORPHANED_VOLUME_FRACTION = 0.7;

/**
 * Snapshots older than 30d still serve some recovery use; older than 90d
 * are usually retained "just in case." We weight them differently and
 * do NOT double-count — the >30d bucket includes the >90d bucket counts
 * which we strip out before pricing the >30d portion.
 */
export const SNAPSHOT_30_90_RECOVERY_FRACTION = 0.3;
export const SNAPSHOT_90_PLUS_RECOVERY_FRACTION = 0.6;

/** ± fraction applied to every point estimate to yield the displayed range. */
export const UNCERTAINTY_FRACTION = 0.25;

// ---------------------------------------------------------------------------
// Banding — total $/month → low/medium/high
// ---------------------------------------------------------------------------

/**
 * Banding thresholds. Tuned so a single ~medium idle instance does not
 * register as "high" — cleanup at small fleets is a habit, not a fire.
 */
export const RISK_BAND_THRESHOLDS = {
  /** Anything at or under this is "low". */
  lowMaxUsd: 100,
  /** Anything strictly under this is "medium"; at/above is "high". */
  highMinUsd: 750,
} as const;

export function classifyRiskBand(monthlyUsd: number): RiskBand {
  if (!Number.isFinite(monthlyUsd) || monthlyUsd < 0) return "low";
  if (monthlyUsd <= RISK_BAND_THRESHOLDS.lowMaxUsd) return "low";
  if (monthlyUsd >= RISK_BAND_THRESHOLDS.highMinUsd) return "high";
  return "medium";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clampNonNeg(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return n;
}

function clampPercent(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function rangeAroundPoint(point: number, fraction = UNCERTAINTY_FRACTION): Range {
  const f = Math.max(0, Math.min(1, fraction));
  const safe = Math.max(0, point);
  return {
    low: Math.max(0, safe * (1 - f)),
    high: safe * (1 + f),
  };
}

function instanceCostFor(p: ProviderInput, size: InstanceSize): number {
  const override = p.costOverrides?.instance?.[size];
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) return override;
  return DEFAULT_INSTANCE_COST[p.provider][size];
}

function volumeCostFor(p: ProviderInput): { perGb: number; avgGb: number } {
  const perGb =
    typeof p.costOverrides?.volumePerGbMonth === "number" &&
    Number.isFinite(p.costOverrides.volumePerGbMonth) &&
    p.costOverrides.volumePerGbMonth >= 0
      ? p.costOverrides.volumePerGbMonth
      : DEFAULT_VOLUME_COST_PER_GB[p.provider];
  const avgGb =
    typeof p.costOverrides?.avgVolumeGb === "number" &&
    Number.isFinite(p.costOverrides.avgVolumeGb) &&
    p.costOverrides.avgVolumeGb >= 0
      ? p.costOverrides.avgVolumeGb
      : DEFAULT_AVG_VOLUME_GB;
  return { perGb, avgGb };
}

function snapshotCostFor(p: ProviderInput): { perGb: number; avgGb: number } {
  const perGb =
    typeof p.costOverrides?.snapshotPerGbMonth === "number" &&
    Number.isFinite(p.costOverrides.snapshotPerGbMonth) &&
    p.costOverrides.snapshotPerGbMonth >= 0
      ? p.costOverrides.snapshotPerGbMonth
      : DEFAULT_SNAPSHOT_COST_PER_GB[p.provider];
  const avgGb =
    typeof p.costOverrides?.avgSnapshotGb === "number" &&
    Number.isFinite(p.costOverrides.avgSnapshotGb) &&
    p.costOverrides.avgSnapshotGb >= 0
      ? p.costOverrides.avgSnapshotGb
      : DEFAULT_AVG_SNAPSHOT_GB;
  return { perGb, avgGb };
}

function totalProviderInstanceSpend(p: ProviderInput): number {
  const sizes: InstanceSize[] = ["small", "medium", "large"];
  return sizes.reduce(
    (acc, s) => acc + clampNonNeg(p.instances[s]) * instanceCostFor(p, s),
    0,
  );
}

// ---------------------------------------------------------------------------
// Per-category estimates
// ---------------------------------------------------------------------------

function estimateIdleCompute(inputs: ProviderInput[]): CategoryEstimate {
  let point = 0;
  let totalRunningInstances = 0;
  for (const p of inputs) {
    const monthlySpend = totalProviderInstanceSpend(p);
    const idleFraction = clampPercent(p.idlePercent) / 100;
    point += monthlySpend * idleFraction * SAFE_IDLE_RECOVERY_FRACTION;
    totalRunningInstances +=
      clampNonNeg(p.instances.small) +
      clampNonNeg(p.instances.medium) +
      clampNonNeg(p.instances.large);
  }
  const rationale =
    totalRunningInstances === 0
      ? "No running instances entered — no idle compute estimate."
      : `Assumes about ${Math.round(SAFE_IDLE_RECOVERY_FRACTION * 100)}% of self-reported idle instances are realistically removable after manual verification. List-price ballpark only.`;
  return { point, range: rangeAroundPoint(point), rationale };
}

function estimateOrphanedVolumes(inputs: ProviderInput[]): CategoryEstimate {
  let point = 0;
  let totalUnattached = 0;
  for (const p of inputs) {
    const { perGb, avgGb } = volumeCostFor(p);
    const ghosts =
      clampNonNeg(p.unattachedVolumes) * ORPHANED_VOLUME_FRACTION;
    point += ghosts * avgGb * perGb;
    totalUnattached += clampNonNeg(p.unattachedVolumes);
  }
  const rationale =
    totalUnattached === 0
      ? "No unattached volumes entered — no orphaned volume estimate."
      : `Assumes about ${Math.round(ORPHANED_VOLUME_FRACTION * 100)}% of unattached volumes are genuinely abandoned vs intentionally detached. Sized at the listed average GB per volume.`;
  return { point, range: rangeAroundPoint(point), rationale };
}

function estimateOldSnapshots(inputs: ProviderInput[]): CategoryEstimate {
  let point = 0;
  let totalSnapshots = 0;
  for (const p of inputs) {
    const { perGb, avgGb } = snapshotCostFor(p);
    const ninetyPlus = clampNonNeg(p.snapshotsOlder90d);
    // Avoid double-counting — the 30d bucket nominally includes the 90d
    // count, so subtract before pricing the 30–90 day band differently.
    const thirtyToNinety = Math.max(
      0,
      clampNonNeg(p.snapshotsOlder30d) - ninetyPlus,
    );
    const recoverable30 = thirtyToNinety * SNAPSHOT_30_90_RECOVERY_FRACTION;
    const recoverable90 = ninetyPlus * SNAPSHOT_90_PLUS_RECOVERY_FRACTION;
    point += (recoverable30 + recoverable90) * avgGb * perGb;
    totalSnapshots += clampNonNeg(p.snapshotsOlder30d) + ninetyPlus;
  }
  const rationale =
    totalSnapshots === 0
      ? "No old snapshots entered — no snapshot waste estimate."
      : "Snapshots older than 90 days are weighted more heavily as removable than the 30–90 day band. Verify backup needs before deletion.";
  return { point, range: rangeAroundPoint(point), rationale };
}

// ---------------------------------------------------------------------------
// Recommendations — high-level only, never expose internal thresholds.
// ---------------------------------------------------------------------------

function buildRecommendations(
  inputs: ProviderInput[],
  breakdown: EstimateBreakdown,
): string[] {
  const recs: string[] = [];

  const anyInstances = inputs.some(
    (p) =>
      clampNonNeg(p.instances.small) +
        clampNonNeg(p.instances.medium) +
        clampNonNeg(p.instances.large) >
      0,
  );
  const anyUnattached = inputs.some((p) => clampNonNeg(p.unattachedVolumes) > 0);
  const anyOldSnapshots = inputs.some(
    (p) =>
      clampNonNeg(p.snapshotsOlder30d) > 0 ||
      clampNonNeg(p.snapshotsOlder90d) > 0,
  );

  if (anyInstances && breakdown.idleCompute.point > 0) {
    recs.push(
      "Review instances with no recent traffic or login activity and confirm with their owner before shutting down.",
    );
  }
  if (anyUnattached && breakdown.orphanedVolumes.point > 0) {
    recs.push(
      "Audit unattached volumes — for each, take a final snapshot, label why it existed, then delete on a delay.",
    );
  }
  if (anyOldSnapshots && breakdown.oldSnapshots.point > 0) {
    recs.push(
      "Sweep snapshots older than 90 days. Keep one per critical workload as a recovery point and remove the rest after sign-off.",
    );
  }

  recs.push(
    "Tag everything you keep — environment, owner, expiry — so the next sweep takes minutes instead of hours.",
  );
  recs.push(
    "Schedule the sweep monthly. Cloud waste creeps back in faster than most teams expect.",
  );

  return recs;
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

/**
 * Compute a banded waste estimate from rough self-reported inputs.
 * Pure, deterministic, side-effect free — safe for both server and browser.
 */
export function estimateCloudWaste(input: EstimatorInput): EstimateResult {
  const inputs = (input.providers ?? []).map(normaliseProviderInput);

  const idleCompute = estimateIdleCompute(inputs);
  const orphanedVolumes = estimateOrphanedVolumes(inputs);
  const oldSnapshots = estimateOldSnapshots(inputs);

  const breakdown: EstimateBreakdown = {
    idleCompute,
    orphanedVolumes,
    oldSnapshots,
  };

  const totalPoint =
    idleCompute.point + orphanedVolumes.point + oldSnapshots.point;
  const totalRange: Range = {
    low:
      idleCompute.range.low + orphanedVolumes.range.low + oldSnapshots.range.low,
    high:
      idleCompute.range.high +
      orphanedVolumes.range.high +
      oldSnapshots.range.high,
  };

  const total: CategoryEstimate = {
    point: totalPoint,
    range: totalRange,
    rationale:
      totalPoint === 0
        ? "Enter some counts above to see an estimate."
        : "All numbers are rough monthly USD using public list prices and conservative recovery assumptions.",
  };

  return {
    total,
    breakdown,
    riskBand: classifyRiskBand(totalPoint),
    providersSeen: inputs.map((p) => p.provider),
    recommendations: buildRecommendations(inputs, breakdown),
  };
}

function normaliseProviderInput(p: ProviderInput): ProviderInput {
  return {
    ...p,
    instances: {
      small: clampNonNeg(p.instances?.small),
      medium: clampNonNeg(p.instances?.medium),
      large: clampNonNeg(p.instances?.large),
    },
    idlePercent: clampPercent(p.idlePercent),
    attachedVolumes: clampNonNeg(p.attachedVolumes),
    unattachedVolumes: clampNonNeg(p.unattachedVolumes),
    snapshotsOlder30d: clampNonNeg(p.snapshotsOlder30d),
    snapshotsOlder90d: clampNonNeg(p.snapshotsOlder90d),
  };
}

/** Convenience — empty per-provider entry, used by the form. */
export function emptyProviderInput(provider: Provider): ProviderInput {
  return {
    provider,
    instances: { small: 0, medium: 0, large: 0 },
    idlePercent: 0,
    attachedVolumes: 0,
    unattachedVolumes: 0,
    snapshotsOlder30d: 0,
    snapshotsOlder90d: 0,
  };
}

/**
 * Format USD ranges for display. We round to whole dollars; precision beyond
 * that is dishonest given the wide uncertainty band.
 */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "$0";
  if (amount >= 1000) {
    return `$${Math.round(amount).toLocaleString("en-US")}`;
  }
  return `$${Math.round(amount)}`;
}

export function formatRangeUsd(range: Range): string {
  return `${formatUsd(range.low)}–${formatUsd(range.high)}/mo`;
}

/** Build a plain-text checklist tailored to the current estimate. */
export function buildChecklist(result: EstimateResult): string {
  const lines: string[] = [
    "Blackglass — Cloud waste cleanup checklist",
    "",
    `Estimated monthly waste: ${formatRangeUsd(result.total.range)}`,
    `Risk band: ${result.riskBand.toUpperCase()}`,
    "",
    "Breakdown:",
    `- Idle compute:        ${formatRangeUsd(result.breakdown.idleCompute.range)}`,
    `- Orphaned volumes:    ${formatRangeUsd(result.breakdown.orphanedVolumes.range)}`,
    `- Old snapshots:       ${formatRangeUsd(result.breakdown.oldSnapshots.range)}`,
    "",
    "Cleanup steps:",
  ];
  result.recommendations.forEach((r, i) => {
    lines.push(`${i + 1}. ${r}`);
  });
  lines.push(
    "",
    "Notes:",
    "- Directionally useful, not authoritative — list-price estimates, not your bill.",
    "- Always confirm with the owning team before deleting infrastructure.",
    "- For continuous multi-cloud scans with approval-gated cleanup, see Charon",
    "  in Blackglass. Sample workspace: https://blackglasssec.com/demo",
    "",
    "https://blackglasssec.com/tools/cloud-waste-estimator",
  );
  return lines.join("\n");
}
