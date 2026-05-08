/**
 * Pure-logic tests for the drift_events partition month calculator.
 *
 * The DB-touching behaviour (`ensureUpcomingDriftPartitions`) is
 * exercised by the migrations CI job — here we just lock the date
 * arithmetic, since a missed boundary or a leap-month bug would
 * leave inserts hitting drift_events_default.
 */

import { describe, it, expect } from "vitest";
import { __test__ } from "../../src/lib/server/services/partition-maintenance-service";

const { nextMonths } = __test__;

describe("nextMonths", () => {
  it("returns the requested number of consecutive months starting at the current month", () => {
    const out = nextMonths(3, new Date(Date.UTC(2026, 4, 8))); // May 2026
    expect(out).toEqual([
      { name: "drift_events_2026_05", startIso: "2026-05-01", endIso: "2026-06-01" },
      { name: "drift_events_2026_06", startIso: "2026-06-01", endIso: "2026-07-01" },
      { name: "drift_events_2026_07", startIso: "2026-07-01", endIso: "2026-08-01" },
    ]);
  });

  it("rolls over the year boundary correctly", () => {
    const out = nextMonths(3, new Date(Date.UTC(2026, 10, 15))); // Nov 2026
    expect(out.map((m) => m.name)).toEqual([
      "drift_events_2026_11",
      "drift_events_2026_12",
      "drift_events_2027_01",
    ]);
    expect(out[2].startIso).toBe("2027-01-01");
    expect(out[2].endIso).toBe("2027-02-01");
  });

  it("handles December-as-anchor (start month is wrapped, not duplicated)", () => {
    const out = nextMonths(2, new Date(Date.UTC(2026, 11, 31))); // Dec 31 2026
    expect(out.map((m) => m.name)).toEqual([
      "drift_events_2026_12",
      "drift_events_2027_01",
    ]);
  });

  it("ignores day-of-month — the first of the month is always the partition boundary", () => {
    const a = nextMonths(1, new Date(Date.UTC(2026, 4, 1)));
    const b = nextMonths(1, new Date(Date.UTC(2026, 4, 28)));
    expect(a).toEqual(b);
  });

  it("returns an empty array when count=0 (defensive)", () => {
    expect(nextMonths(0)).toEqual([]);
  });
});
