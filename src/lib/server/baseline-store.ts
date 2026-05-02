/**
 * Baseline store.
 *
 * Persistence adapters (in priority order):
 *  1. Spaces — when DO_SPACES_KEY + DO_SPACES_SECRET + DO_SPACES_BUCKET + DO_SPACES_ENDPOINT are set
 *  2. Filesystem — when BASELINE_STORE_PATH is set (local dev / Docker)
 *  3. Memory — default for CI / local dev without env vars (ephemeral on App Platform)
 */

import type { HostSnapshot } from "./collector";
import { getBaselineRepository } from "./store";

export async function saveBaseline(snapshot: HostSnapshot): Promise<void> {
  return getBaselineRepository().save(snapshot);
}

export async function getBaseline(hostId: string): Promise<HostSnapshot | undefined> {
  return getBaselineRepository().get(hostId);
}

export async function listBaselineHostIds(): Promise<string[]> {
  return getBaselineRepository().listHostIds();
}

export async function hasBaseline(hostId: string): Promise<boolean> {
  return getBaselineRepository().has(hostId);
}

/** Synchronous health snapshot — safe to call in server component render. */
export function baselineStoreHealth() {
  return getBaselineRepository().health();
}
