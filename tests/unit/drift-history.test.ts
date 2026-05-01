import { describe, expect, it } from "vitest";
import { chartFromDayEntries } from "@/lib/server/drift-history";

describe("chartFromDayEntries", () => {
  it("returns empty for empty input", () => {
    expect(chartFromDayEntries([])).toEqual([]);
  });

  it("normalizes last six days as percentage of max count", () => {
    const days = [
      { ymd: "2026-05-01", totalNewFindings: 2 },
      { ymd: "2026-05-02", totalNewFindings: 10 },
    ];
    const chart = chartFromDayEntries(days);
    expect(chart).toHaveLength(2);
    expect(chart[0].valuePct).toBe(20);
    expect(chart[1].valuePct).toBe(100);
  });
});
