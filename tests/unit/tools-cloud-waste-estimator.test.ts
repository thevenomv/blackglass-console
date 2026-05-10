import { describe, expect, it } from "vitest";
import {
  buildChecklist,
  classifyRiskBand,
  emptyProviderInput,
  estimateCloudWaste,
  formatRangeUsd,
  formatUsd,
  ORPHANED_VOLUME_FRACTION,
  RISK_BAND_THRESHOLDS,
  SAFE_IDLE_RECOVERY_FRACTION,
  SNAPSHOT_30_90_RECOVERY_FRACTION,
  SNAPSHOT_90_PLUS_RECOVERY_FRACTION,
  UNCERTAINTY_FRACTION,
  type EstimateResult,
} from "@/lib/tools/cloud-waste/estimator";

function makeDoIdle(idleInstancesMedium: number, idlePct = 100) {
  return {
    providers: [
      {
        ...emptyProviderInput("do"),
        instances: { small: 0, medium: idleInstancesMedium, large: 0 },
        idlePercent: idlePct,
      },
    ],
  };
}

describe("Cloud waste estimator — band classifier", () => {
  it("returns low for $0", () => {
    expect(classifyRiskBand(0)).toBe("low");
  });

  it("treats negative or NaN inputs as low (defensive)", () => {
    expect(classifyRiskBand(-50)).toBe("low");
    expect(classifyRiskBand(Number.NaN)).toBe("low");
  });

  it("uses lowMaxUsd as inclusive upper bound for low", () => {
    expect(classifyRiskBand(RISK_BAND_THRESHOLDS.lowMaxUsd)).toBe("low");
    expect(classifyRiskBand(RISK_BAND_THRESHOLDS.lowMaxUsd + 0.01)).toBe("medium");
  });

  it("uses highMinUsd as inclusive lower bound for high", () => {
    expect(classifyRiskBand(RISK_BAND_THRESHOLDS.highMinUsd - 0.01)).toBe("medium");
    expect(classifyRiskBand(RISK_BAND_THRESHOLDS.highMinUsd)).toBe("high");
  });
});

describe("Cloud waste estimator — outputs", () => {
  it("returns zeros and a low band when nothing is entered", () => {
    const res: EstimateResult = estimateCloudWaste({
      providers: [emptyProviderInput("aws")],
    });
    expect(res.total.point).toBe(0);
    expect(res.total.range.low).toBe(0);
    expect(res.total.range.high).toBe(0);
    expect(res.riskBand).toBe("low");
    // We always include closing recommendations even when no inputs:
    expect(res.recommendations.length).toBeGreaterThanOrEqual(2);
  });

  it("never emits a negative low bound", () => {
    // Single small instance at 100% idle — point estimate is small;
    // applying ±25% on a small number must still floor at 0.
    const res = estimateCloudWaste({
      providers: [
        {
          ...emptyProviderInput("do"),
          instances: { small: 1, medium: 0, large: 0 },
          idlePercent: 100,
        },
      ],
    });
    expect(res.breakdown.idleCompute.range.low).toBeGreaterThanOrEqual(0);
    expect(res.total.range.low).toBeGreaterThanOrEqual(0);
  });

  it("idle compute scales with the safe-recovery fraction", () => {
    // 10 medium DO instances ($48/mo each) at 100% idle.
    // Expected point = 10 * 48 * 1.0 * SAFE_IDLE_RECOVERY_FRACTION
    const res = estimateCloudWaste(makeDoIdle(10, 100));
    const expected = 10 * 48 * SAFE_IDLE_RECOVERY_FRACTION;
    expect(res.breakdown.idleCompute.point).toBeCloseTo(expected, 6);
    // ± uncertainty band
    expect(res.breakdown.idleCompute.range.low).toBeCloseTo(
      expected * (1 - UNCERTAINTY_FRACTION),
      6,
    );
    expect(res.breakdown.idleCompute.range.high).toBeCloseTo(
      expected * (1 + UNCERTAINTY_FRACTION),
      6,
    );
  });

  it("orphaned volumes use the configured fraction and default GB", () => {
    const res = estimateCloudWaste({
      providers: [
        {
          ...emptyProviderInput("aws"),
          unattachedVolumes: 20,
        },
      ],
    });
    // Default per-GB AWS = 0.10, default avg GB = 100
    const expected = 20 * ORPHANED_VOLUME_FRACTION * 100 * 0.1;
    expect(res.breakdown.orphanedVolumes.point).toBeCloseTo(expected, 6);
  });

  it("avoids double-counting >90d snapshots inside the >30d bucket", () => {
    // 50 snapshots older than 30d, of which 30 are also older than 90d.
    // The 30–90 day band gets: (50 - 30) * SNAPSHOT_30_90_RECOVERY_FRACTION
    // The 90+    day band gets: 30 * SNAPSHOT_90_PLUS_RECOVERY_FRACTION
    const res = estimateCloudWaste({
      providers: [
        {
          ...emptyProviderInput("gcp"),
          snapshotsOlder30d: 50,
          snapshotsOlder90d: 30,
        },
      ],
    });
    // Defaults: avg snapshot 40 GB, GCP $/GB = 0.05
    const recoverable = 20 * SNAPSHOT_30_90_RECOVERY_FRACTION + 30 * SNAPSHOT_90_PLUS_RECOVERY_FRACTION;
    const expected = recoverable * 40 * 0.05;
    expect(res.breakdown.oldSnapshots.point).toBeCloseTo(expected, 6);
  });

  it("is a no-op when older30d < older90d (defensive — clamp to zero band)", () => {
    const res = estimateCloudWaste({
      providers: [
        {
          ...emptyProviderInput("do"),
          snapshotsOlder30d: 5,
          snapshotsOlder90d: 100,
        },
      ],
    });
    // 30–90 band can't be negative, but 90+ band still applies.
    const expected = 100 * SNAPSHOT_90_PLUS_RECOVERY_FRACTION * 40 * 0.06;
    expect(res.breakdown.oldSnapshots.point).toBeCloseTo(expected, 6);
    expect(res.breakdown.oldSnapshots.point).toBeGreaterThanOrEqual(0);
  });

  it("clamps idlePercent above 100 and below 0", () => {
    const high = estimateCloudWaste({
      providers: [
        {
          ...emptyProviderInput("aws"),
          instances: { small: 0, medium: 1, large: 0 },
          idlePercent: 9999, // nonsense — should clamp to 100
        },
      ],
    });
    const low = estimateCloudWaste({
      providers: [
        {
          ...emptyProviderInput("aws"),
          instances: { small: 0, medium: 1, large: 0 },
          idlePercent: -50,
        },
      ],
    });
    expect(high.breakdown.idleCompute.point).toBeGreaterThan(0);
    expect(low.breakdown.idleCompute.point).toBe(0);
  });

  it("ignores negative or non-finite counts (defensive)", () => {
    const res = estimateCloudWaste({
      providers: [
        {
          ...emptyProviderInput("do"),
          instances: {
            small: -5 as unknown as number,
            medium: Number.POSITIVE_INFINITY as unknown as number,
            large: 0,
          },
          unattachedVolumes: -1 as unknown as number,
          snapshotsOlder30d: Number.NaN as unknown as number,
          snapshotsOlder90d: Number.NaN as unknown as number,
        },
      ],
    });
    // All categories collapse to zero, total band stays low.
    expect(res.total.point).toBe(0);
    expect(res.riskBand).toBe("low");
  });

  it("respects per-provider cost overrides for instance prices", () => {
    const res = estimateCloudWaste({
      providers: [
        {
          ...emptyProviderInput("do"),
          instances: { small: 0, medium: 1, large: 0 },
          idlePercent: 100,
          costOverrides: {
            instance: { small: 10, medium: 200, large: 400 },
          },
        },
      ],
    });
    const expected = 200 * SAFE_IDLE_RECOVERY_FRACTION;
    expect(res.breakdown.idleCompute.point).toBeCloseTo(expected, 6);
  });

  it("crosses into 'high' band on a realistically wasteful fleet", () => {
    // ~50 idle medium AWS instances (default $70/mo each) + idle 100%
    // 50 * 70 * SAFE_IDLE_RECOVERY_FRACTION = 50 * 70 * 0.65 = $2,275
    // — comfortably above RISK_BAND_THRESHOLDS.highMinUsd ($750).
    const res = estimateCloudWaste({
      providers: [
        {
          ...emptyProviderInput("aws"),
          instances: { small: 0, medium: 50, large: 0 },
          idlePercent: 100,
        },
      ],
    });
    expect(res.riskBand).toBe("high");
    expect(res.total.range.high).toBeGreaterThan(RISK_BAND_THRESHOLDS.highMinUsd);
  });

  it("stays in the 'medium' band for a small but real wastage signal", () => {
    // ~3 idle medium AWS instances ($70 list) + a dozen unattached volumes —
    // big enough to clear the low/medium boundary ($100), but well under
    // the high threshold ($750). Numbers chosen so the band stays stable
    // even if the recovery fractions are tweaked slightly in future.
    const res = estimateCloudWaste({
      providers: [
        {
          ...emptyProviderInput("aws"),
          instances: { small: 0, medium: 3, large: 0 },
          idlePercent: 100,
          unattachedVolumes: 12,
        },
      ],
    });
    expect(res.riskBand).toBe("medium");
  });

  it("aggregates across multiple providers", () => {
    const res = estimateCloudWaste({
      providers: [
        { ...emptyProviderInput("do"), instances: { small: 0, medium: 1, large: 0 }, idlePercent: 100 },
        { ...emptyProviderInput("aws"), instances: { small: 0, medium: 1, large: 0 }, idlePercent: 100 },
      ],
    });
    // DO medium = $48, AWS medium = $70 — combined point estimate
    const expected = (48 + 70) * SAFE_IDLE_RECOVERY_FRACTION;
    expect(res.breakdown.idleCompute.point).toBeCloseTo(expected, 6);
    expect(res.providersSeen).toEqual(["do", "aws"]);
  });
});

describe("Cloud waste estimator — formatting + checklist", () => {
  it("formatUsd rounds to whole dollars and floors negatives", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(-10)).toBe("$0");
    expect(formatUsd(12.4)).toBe("$12");
    expect(formatUsd(12.6)).toBe("$13");
    expect(formatUsd(1234.56)).toBe("$1,235");
  });

  it("formatRangeUsd renders both bounds and a /mo suffix", () => {
    expect(formatRangeUsd({ low: 100, high: 250 })).toBe("$100–$250/mo");
  });

  it("buildChecklist returns a multi-line cleanup script with totals", () => {
    const res = estimateCloudWaste({
      providers: [
        {
          ...emptyProviderInput("aws"),
          instances: { small: 0, medium: 5, large: 0 },
          idlePercent: 50,
          unattachedVolumes: 3,
          snapshotsOlder30d: 10,
          snapshotsOlder90d: 4,
        },
      ],
    });
    const text = buildChecklist(res);
    expect(text).toContain("Blackglass — Cloud waste cleanup checklist");
    expect(text).toContain(formatRangeUsd(res.total.range));
    expect(text).toContain("Risk band:");
    expect(text).toContain("Idle compute:");
    expect(text).toContain("Orphaned volumes:");
    expect(text).toContain("Old snapshots:");
    // Recommendations are numbered:
    expect(text).toMatch(/\n1\. /);
    expect(text).toContain("https://blackglasssec.com/tools/cloud-waste-estimator");
  });
});
