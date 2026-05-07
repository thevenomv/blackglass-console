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
  days: { ymd: string | Date; totalNewFindings: number }[],
): { day: string; valuePct: number }[] {
  if (days.length === 0) return [];

  // Normalise + filter: accept string YYYY-MM-DD or Date objects; drop entries
  // whose ymd cannot be parsed so we never render an "Invalid Date" label.
  const normalised = days
    .map((d) => {
      const ymdStr =
        typeof d.ymd === "string"
          ? d.ymd
          : d.ymd instanceof Date && !Number.isNaN(d.ymd.getTime())
            ? d.ymd.toISOString().slice(0, 10)
            : "";
      const dt = ymdStr ? new Date(ymdStr + "T12:00:00.000Z") : null;
      return dt && !Number.isNaN(dt.getTime())
        ? { ymd: ymdStr, dt, totalNewFindings: d.totalNewFindings }
        : null;
    })
    .filter((x): x is { ymd: string; dt: Date; totalNewFindings: number } => x !== null);

  if (normalised.length === 0) return [];

  // Sort ascending so the rightmost bar in the chart is always "today".
  normalised.sort((a, b) => a.ymd.localeCompare(b.ymd));

  const slice = normalised.slice(-6);
  const max = Math.max(1, ...slice.map((d) => d.totalNewFindings));
  return slice.map((d) => ({
    day: d.dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
    valuePct: Math.round((d.totalNewFindings / max) * 100),
  }));
}

export async function getDriftVolumeChartFromHistory(): Promise<
  { day: string; valuePct: number }[]
> {
  const days = await getDriftHistoryRepository().getDays();
  return chartFromDayEntries(days);
}
