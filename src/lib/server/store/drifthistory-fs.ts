import * as fs from "fs";
import * as path from "path";
import type { DayEntry, DriftHistoryRepository } from "./types";

type FileShape = { days: DayEntry[] };

export class FilesystemDriftHistoryRepository implements DriftHistoryRepository {
  readonly adapter = "filesystem" as const;

  constructor(private readonly filePath: string) {}

  private load(): FileShape {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const j = JSON.parse(raw) as FileShape;
      if (j && Array.isArray(j.days)) return j;
    } catch { /* missing or invalid */ }
    return { days: [] };
  }

  private persist(data: FileShape): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      console.error("[drift-history/fs] Failed to persist:", err);
    }
  }

  async recordDay(count: number): Promise<void> {
    if (count < 0) return;
    const data = this.load();
    const ymd = new Date().toISOString().slice(0, 10);
    const last = data.days[data.days.length - 1];
    if (last?.ymd === ymd) {
      last.totalNewFindings += count;
    } else {
      data.days.push({ ymd, totalNewFindings: count });
    }
    if (data.days.length > 60) data.days = data.days.slice(-60);
    this.persist(data);
  }

  async getDays(): Promise<DayEntry[]> {
    return this.load().days;
  }
}
