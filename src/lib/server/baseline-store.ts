/**
 * In-process baseline store.
 *
 * A baseline is a HostSnapshot captured at a known-good moment.
 * Stored in a process-global map so it survives across API route calls
 * within the same Next.js server instance.
 *
 * NOTE: baselines do not survive process restarts.  For production persistence
 * you would write to a database; for the demo one process lifetime is fine.
 */

import type { HostSnapshot } from "./collector";

const GLOBAL_KEY = "__blackglass_baselines_v1" as const;

type GlobalWithBaselines = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, HostSnapshot>;
};

function store(): Map<string, HostSnapshot> {
  const g = globalThis as GlobalWithBaselines;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map();
  return g[GLOBAL_KEY];
}

export function saveBaseline(snapshot: HostSnapshot): void {
  store().set(snapshot.hostId, snapshot);
}

export function getBaseline(hostId: string): HostSnapshot | undefined {
  return store().get(hostId);
}

export function listBaselineHostIds(): string[] {
  return [...store().keys()];
}

export function hasBaseline(hostId: string): boolean {
  return store().has(hostId);
}
