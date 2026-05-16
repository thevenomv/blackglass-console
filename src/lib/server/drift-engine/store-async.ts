/**
 * Postgres-backed async paths.
 *
 * The BullMQ scan worker runs in a separate OS process and writes drift
 * events directly to Postgres / the file store; it cannot update the
 * web tier's in-memory map. These functions are how the web tier learns
 * about worker-written events at request time.
 */

import type { DriftEvent } from "@/data/mock/types";
import { eventStore, getDriftEvents, hasDriftData, loadFromFile, persist, storePath } from "./store";

export async function deleteDriftEvents(hostId: string): Promise<boolean> {
  const memRemoved = eventStore().delete(hostId);
  if (memRemoved) persist();

  let pgRemoved = false;
  if (process.env.DATABASE_URL?.trim()) {
    try {
      const { PostgresDriftEventsRepository: repo } = await import("../store/legacy/driftevents-pg");
      pgRemoved = await repo.delete(hostId);
    } catch (err) {
      console.error("[drift-engine] Postgres delete failed:", err);
    }
  }

  return memRemoved || pgRemoved;
}

/**
 * Async variant of `getDriftEvents` — always re-reads from Postgres when
 * DATABASE_URL is set, or from the file store when DRIFT_EVENTS_PATH is
 * set. The previous `isEmpty` guard caused staleness: once the in-memory
 * store was hydrated once, new worker-written events were never picked up
 * until the process restarted.
 */
export async function getDriftEventsAsync(hostId?: string): Promise<DriftEvent[]> {
  const store = eventStore();

  if (process.env.DATABASE_URL?.trim()) {
    // Always refresh from Postgres so cross-process writes are visible.
    try {
      const { PostgresDriftEventsRepository: repo } = await import("../store/legacy/driftevents-pg");
      const all = await repo.getAll();
      const byHost = new Map<string, DriftEvent[]>();
      for (const evt of all) {
        const list = byHost.get(evt.hostId) ?? [];
        list.push(evt);
        byHost.set(evt.hostId, list);
      }
      // Replace the in-memory store wholesale so synchronous getDriftEvents()
      // callers in this request also see the fresh data.
      store.clear();
      for (const [hid, evts] of byHost) store.set(hid, evts);
    } catch (err) {
      console.error("[drift-engine] Postgres hydration failed:", err);
      // Fall through and return whatever is in memory.
    }
  } else {
    // No Postgres — re-read from file on every async call so worker-written
    // events (persisted via DRIFT_EVENTS_PATH) are picked up by this process.
    const fp = storePath();
    if (fp) {
      const fromFile = loadFromFile(fp);
      store.clear();
      for (const [hid, evts] of fromFile) store.set(hid, evts);
    }
  }

  return getDriftEvents(hostId);
}

/** Async variant of `hasDriftData` — checks Postgres when memory is empty. */
export async function hasDriftDataAsync(): Promise<boolean> {
  if (hasDriftData()) return true;
  if (!process.env.DATABASE_URL?.trim()) return false;
  try {
    const { PostgresDriftEventsRepository: repo } = await import("../store/legacy/driftevents-pg");
    return repo.hasAny();
  } catch {
    return false;
  }
}
