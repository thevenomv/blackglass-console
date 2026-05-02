import type { HostSnapshot } from "@/lib/server/collector/types";
import type { BaselineRepository, BaselineStoreHealth } from "./types";

const GLOBAL_KEY = "__blackglass_baselines_v1" as const;
type G = typeof globalThis & { [GLOBAL_KEY]?: Map<string, HostSnapshot> };

function store(): Map<string, HostSnapshot> {
  const g = globalThis as G;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map();
  return g[GLOBAL_KEY];
}

export class MemoryBaselineRepository implements BaselineRepository {
  async save(snapshot: HostSnapshot) { store().set(snapshot.hostId, snapshot); }
  async get(hostId: string) { return store().get(hostId); }
  async listHostIds() { return [...store().keys()]; }
  async has(hostId: string) { return store().has(hostId); }
  health(): BaselineStoreHealth { return { adapter: "memory", configured: false, writable: null }; }
}
