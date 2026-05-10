import { describe, expect, it } from "vitest";
import {
  buildCharonScanSnapshot,
  diffCharonScanSnapshots,
  parseCharonScanSnapshot,
} from "@/lib/janitor/charon-scan-diff";

describe("charon-scan-diff", () => {
  it("diffCharonScanSnapshots detects added, removed, and score changes", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const prev = buildCharonScanSnapshot(t0, [
      { resourceType: "droplet", resourceId: "1", resourceName: "a", idleScore: 40 },
      { resourceType: "droplet", resourceId: "2", resourceName: "b", idleScore: 50 },
    ]);
    const t1 = new Date("2026-01-02T00:00:00Z");
    const cur = buildCharonScanSnapshot(t1, [
      { resourceType: "droplet", resourceId: "1", resourceName: "a", idleScore: 80 },
      { resourceType: "droplet", resourceId: "3", resourceName: "c", idleScore: 10 },
    ]);
    const d = diffCharonScanSnapshots(prev, cur);
    expect(d.counts.added).toBe(1);
    expect(d.counts.removed).toBe(1);
    expect(d.counts.scoreChanged).toBe(1);
    expect(d.added[0]?.resourceId).toBe("3");
    expect(d.removed[0]?.resourceId).toBe("2");
    expect(d.scoreChanged[0]?.resourceId).toBe("1");
    expect(d.scoreChanged[0]?.previousScore).toBe(40);
    expect(d.scoreChanged[0]?.currentScore).toBe(80);
  });

  it("parseCharonScanSnapshot accepts v1 snapshot", () => {
    const snap = buildCharonScanSnapshot(new Date(), []);
    expect(parseCharonScanSnapshot(snap)).toEqual(snap);
    expect(parseCharonScanSnapshot(null)).toBeNull();
  });
});
