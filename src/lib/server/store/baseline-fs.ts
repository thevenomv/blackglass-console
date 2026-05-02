import * as fs from "fs";
import * as path from "path";
import type { HostSnapshot } from "@/lib/server/collector/types";
import type { BaselineRepository, BaselineStoreHealth } from "./types";

export class FilesystemBaselineRepository implements BaselineRepository {
  private map: Map<string, HostSnapshot>;

  constructor(private readonly filePath: string) {
    this.map = this.loadFromFile();
  }

  private loadFromFile(): Map<string, HostSnapshot> {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const obj = JSON.parse(raw) as Record<string, HostSnapshot>;
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  }

  private saveToFile(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj = Object.fromEntries(this.map.entries());
      fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), "utf8");
    } catch (err) {
      console.error("[baseline-store/fs] Failed to persist:", err);
    }
  }

  async save(snapshot: HostSnapshot) {
    this.map.set(snapshot.hostId, snapshot);
    this.saveToFile();
  }

  async get(hostId: string) { return this.map.get(hostId); }
  async listHostIds() { return [...this.map.keys()]; }
  async has(hostId: string) { return this.map.has(hostId); }

  health(): BaselineStoreHealth {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return { adapter: "filesystem", configured: true, path: this.filePath, writable: true };
    } catch {
      return { adapter: "filesystem", configured: true, path: this.filePath, writable: false };
    }
  }
}
