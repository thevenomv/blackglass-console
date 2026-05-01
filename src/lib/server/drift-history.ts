/**
 * Optional rolling drift scan history for the fleet dashboard chart.
 * When DRIFT_HISTORY_PATH is set, each successful scan appends a per-UTC-day tally.
 */

import * as fs from "fs";
import * as path from "path";

type DayEntry = { ymd: string; totalNewFindings: number };

type FileShape = { days: DayEntry[] };

const GLOBAL_KEY = "__blackglass_drift_history_mw_v1" as const;
type G = typeof globalThis & { [GLOBAL_KEY]?: FileShape };

function historyPath(): string | undefined {
  return process.env.DRIFT_HISTORY_PATH;
}

function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadFile(fp: string): FileShape {
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const j = JSON.parse(raw) as FileShape;
    if (j && Array.isArray(j.days)) return j;
  } catch {
    /* missing or invalid */
  }
  return { days: [] };
}

function persist(fp: string, data: FileShape): void {
  try {
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[drift-history] Failed to persist:", err);
  }
}

function memoryStore(): FileShape {
  const g = globalThis as G;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { days: [] };
  return g[GLOBAL_KEY];
}

function loadMerged(): FileShape {
  const fp = historyPath();
  if (fp) return loadFile(fp);
  return memoryStore();
}

function saveMerged(data: FileShape): void {
  const fp = historyPath();
  if (fp) persist(fp, data);
  const g = globalThis as G;
  g[GLOBAL_KEY] = data;
}

/**
 * Called after a fleet scan records drift. Adds `count` to today’s UTC bucket.
 */
export function recordDriftScanDayStamp(count: number): void {
  if (count < 0) return;
  const data = loadMerged();
  const ymd = todayUtcYmd();
  const last = data.days[data.days.length - 1];
  if (last?.ymd === ymd) {
    last.totalNewFindings += count;
  } else {
    data.days.push({ ymd, totalNewFindings: count });
  }
  // keep at most 60 days to cap file size
  if (data.days.length > 60) data.days = data.days.slice(-60);
  saveMerged(data);
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

/** Last up to 6 buckets as % of max in window — matches `FleetSnapshot.driftVolumeByDay` shape */
export function getDriftVolumeChartFromHistory(): { day: string; valuePct: number }[] {
  const { days } = loadMerged();
  return chartFromDayEntries(days);
}
