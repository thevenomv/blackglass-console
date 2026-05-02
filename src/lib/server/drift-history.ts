/**
 * Rolling drift scan history for the fleet dashboard chart.
 * Uses the same persistence adapter as baselines (Spaces / filesystem / memory).
 */

import { getDriftHistoryRepository } from "./store";

export type DayEntry = { ymd: string; totalNewFindings: number };

export async function recordDriftScanDayStamp(count: number): Promise<void> {
  return getDriftHistoryRepository().recordDay(count);
}

/** Pure helper for chart shaping — unit-tested independently of persistence. */
export function chartFromDayEntries(
  days: { ymd: string; totalNewFindings: number }[],
): { day: string; valuePct: number }[] {
  if (days.length === 0) return [];
  const slice = days.slice(-6);
  const max = Math.max(1, ...slice.map((d) => d.totalNewFindings));
  return slice.map((d) => {
    const wd = new Date(d.ymd + "T12:00:00.000Z").toLocaleDateString("en-GB", {
      weekday: "short",
      timeZone: "UTC",
    });
    return {
      day: wd,
      valuePct: Math.round((d.totalNewFindings / max) * 100),
    };
  });
}

export async function getDriftVolumeChartFromHistory(): Promise<
  { day: string; valuePct: number }[]
> {
  const days = await getDriftHistoryRepository().getDays();
  return chartFromDayEntries(days);
}
