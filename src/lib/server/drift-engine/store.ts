/**
 * In-process drift-event store with optional JSON file persistence.
 *
 * Used by the synchronous code paths. The async DB-backed reads live in
 * `./store-async.ts` and write *through* this same map so synchronous
 * readers in the same request see the freshly hydrated data.
 */

import type { DriftEvent } from "@/data/mock/types";
import * as fs from "fs";
import * as path from "path";

const GLOBAL_KEY = "__blackglass_drift_events_v1" as const;

type GlobalWithEvents = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, DriftEvent[]>; // hostId → events
};

type SerializedStore = Record<string, DriftEvent[]>;

export function storePath(): string | undefined {
  return process.env.DRIFT_EVENTS_PATH;
}

export function loadFromFile(filePath: string): Map<string, DriftEvent[]> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const obj = JSON.parse(raw) as SerializedStore;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveToFile(filePath: string, map: Map<string, DriftEvent[]>): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj: SerializedStore = Object.fromEntries(map);
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.error("[drift-engine] Failed to persist:", err);
  }
}

export function eventStore(): Map<string, DriftEvent[]> {
  const g = globalThis as GlobalWithEvents;
  if (!g[GLOBAL_KEY]) {
    const fp = storePath();
    g[GLOBAL_KEY] = fp ? loadFromFile(fp) : new Map();
  }
  return g[GLOBAL_KEY];
}

export function persist(): void {
  const fp = storePath();
  if (fp) saveToFile(fp, eventStore());
}

export function storeDriftEvents(hostId: string, events: DriftEvent[]): void {
  eventStore().set(hostId, events);
  persist();
  // Replicate to Postgres when DATABASE_URL is configured so multi-instance
  // deployments and BullMQ workers share drift state.
  if (process.env.DATABASE_URL?.trim()) {
    void import("../store/legacy/driftevents-pg")
      .then(({ PostgresDriftEventsRepository: repo }) => repo.store(hostId, events))
      .catch((err) => console.error("[drift-engine] Postgres store failed:", err));
  }
}

export function getDriftEvents(hostId?: string): DriftEvent[] {
  const store = eventStore();
  if (hostId) return store.get(hostId) ?? [];
  const all: DriftEvent[] = [];
  for (const evts of store.values()) all.push(...evts);
  return all.sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );
}

export function hasDriftData(): boolean {
  return eventStore().size > 0;
}
