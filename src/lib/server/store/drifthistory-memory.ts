import type { DayEntry, DriftHistoryRepository } from "./types";

const GLOBAL_KEY = "__blackglass_drift_history_mw_v1" as const;
type G = typeof globalThis & { [GLOBAL_KEY]?: { days: DayEntry[] } };

function store(): { days: DayEntry[] } {
  const g = globalThis as G;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { days: [] };
  return g[GLOBAL_KEY];
}

export class MemoryDriftHistoryRepository implements DriftHistoryRepository {
  readonly adapter = "memory" as const;
  async recordDay(count: number): Promise<void> {
    if (count < 0) return;
    const data = store();
    const ymd = new Date().toISOString().slice(0, 10);
    const last = data.days[data.days.length - 1];
    if (last?.ymd === ymd) {
      last.totalNewFindings += count;
    } else {
      data.days.push({ ymd, totalNewFindings: count });
    }
    if (data.days.length > 60) data.days = data.days.slice(-60);
  }

  async getDays(): Promise<DayEntry[]> {
    return [...store().days];
  }
}
