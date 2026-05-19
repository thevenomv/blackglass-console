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

/**
 * Atomically insert a baseline only when one does not yet exist for this host.
 *
 * Returns `true` when the row was actually created; `false` when a concurrent
 * first-push already wrote a baseline (DO NOTHING on Postgres, check-then-set
 * on other adapters).  Callers should treat `false` as "already bootstrapped —
 * skip clearing drift events".
 */
export async function saveBaselineIfAbsent(snapshot: HostSnapshot): Promise<boolean> {
  const repo = getBaselineRepository();
  // PostgresBaselineRepository exposes an atomic DO NOTHING variant.
  if ("saveIfAbsent" in repo && typeof (repo as { saveIfAbsent?: unknown }).saveIfAbsent === "function") {
    return (repo as { saveIfAbsent: (s: HostSnapshot) => Promise<boolean> }).saveIfAbsent(snapshot);
  }
  // Non-postgres adapters are single-process — a non-atomic check is sufficient.
  const existing = await repo.get(snapshot.hostId);
  if (existing) return false;
  await repo.save(snapshot);
  return true;
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

/**
 * Forget a host: removes its pinned baseline. Resolves to `true` when
 * something was actually removed (idempotent — `false` if nothing was
 * there). Drift events and any saas_collector_hosts row are NOT touched
 * here; the DELETE /api/v1/hosts/[id] route owns the full cascade.
 */
export async function deleteBaseline(hostId: string): Promise<boolean> {
  return getBaselineRepository().delete(hostId);
}

/** Synchronous health snapshot — safe to call in server component render. */
export function baselineStoreHealth() {
  return getBaselineRepository().health();
}
