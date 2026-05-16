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
    expect(chart[0]!.valuePct).toBe(20);
    expect(chart[1]!.valuePct).toBe(100);
  });

  it("accepts Date objects (Postgres DATE columns) without producing 'Invalid Date'", () => {
    const days = [
      { ymd: new Date("2026-05-06T00:00:00Z"), totalNewFindings: 4 },
      { ymd: new Date("2026-05-07T00:00:00Z"), totalNewFindings: 8 },
    ];
    const chart = chartFromDayEntries(days);
    expect(chart).toHaveLength(2);
    for (const c of chart) {
      expect(c.day).not.toBe("Invalid Date");
      expect(c.day).toMatch(/^[A-Za-z]{3}$/);
    }
  });

  it("drops entries with unparseable ymd rather than rendering 'Invalid Date'", () => {
    const days = [
      { ymd: "not-a-date", totalNewFindings: 5 },
      { ymd: "2026-05-07", totalNewFindings: 10 },
    ];
    const chart = chartFromDayEntries(days);
    expect(chart).toHaveLength(1);
    expect(chart[0]!.day).not.toBe("Invalid Date");
  });

  it("returns the most recent six days when more than six are supplied", () => {
    const days = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(2026, 4, 1 + i);
      return { ymd: d.toISOString().slice(0, 10), totalNewFindings: i + 1 };
    });
    const chart = chartFromDayEntries(days);
    expect(chart).toHaveLength(6);
    // last entry should correspond to the highest-numbered day (most recent)
    expect(chart[chart.length - 1]!.valuePct).toBe(100);
  });
});
