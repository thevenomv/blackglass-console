/**
 * In-process cache of the most recent push-agent snapshot per host.
 *
 * Why this exists
 * ---------------
 * When a user clicks "Re-scan" the collector tries an SSH pull. On
 * DigitalOcean App Platform → Droplet, that pull is silently blackholed
 * by the DO network fabric for some IP combinations (and on-prem
 * customers behind NAT / Tailscale see the same symptom). We already
 * have an SSH-fail fallback in `collector/collect.ts` that tries to use
 * a recent agent-pushed snapshot — but it was reading from the baseline
 * store, and the baseline store is only written ONCE on bootstrap. So
 * `baseline.collectedAt` froze at bootstrap time and the fallback's
 * 15-minute freshness window always rejected it. Result: the user got
 * a `TCP connect to ...:22 timed out` toast even though the push agent
 * had ingested a fresh snapshot moments earlier.
 *
 * This cache fixes that by recording every successful agent push in
 * memory, with the snapshot's `collectedAt` so the freshness check
 * still works. The collector consults it first, and only surfaces the
 * SSH error when there is genuinely no recent telemetry.
 *
 * Design notes
 * ------------
 *  - In-process (not Redis / not Postgres). The agent re-pushes every
 *    ~5 minutes, so a deploy / restart self-heals within one cycle.
 *    Multi-instance App Platform setups are fine: each instance builds
 *    its own cache as it sees pushes, and any instance can satisfy a
 *    fallback once it has cached.
 *  - TTL-bounded so we never serve stale data past the agent's push
 *    interval. Tunable via `COLLECTOR_AGENT_FALLBACK_WINDOW_SECONDS`
 *    (the same env var the collector fallback already honours).
 *  - Safe to call from anywhere on the server: zero side effects on
 *    failure, no I/O, no external calls.
 */

import type { HostSnapshot } from "@/lib/server/collector/types";

type CacheEntry = {
  snapshot: HostSnapshot;
  recordedAt: number; // wall-clock ms when the push was received
};

const cache = new Map<string, CacheEntry>();

/** Max entries we'll hold; defends against accidental hostId explosions. */
const MAX_ENTRIES = 1000;

/** Record the snapshot from a successful push-agent ingest. */
export function recordAgentSnapshot(snapshot: HostSnapshot): void {
  if (!snapshot?.hostId) return;
  if (cache.size >= MAX_ENTRIES && !cache.has(snapshot.hostId)) {
    // Evict the oldest entry to keep the map bounded.
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [k, v] of cache) {
      if (v.recordedAt < oldestAt) {
        oldestAt = v.recordedAt;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(snapshot.hostId, {
    snapshot,
    recordedAt: Date.now(),
  });
}

/**
 * Look up the most recent agent push for `hostId`. Returns the snapshot
 * only if it is still within `maxAgeSeconds` (measured against the
 * snapshot's `collectedAt`, falling back to `recordedAt` when missing
 * or unparseable). Returns `null` otherwise.
 */
export function getRecentAgentSnapshot(
  hostId: string,
  maxAgeSeconds: number,
): HostSnapshot | null {
  const entry = cache.get(hostId);
  if (!entry) return null;

  const collectedMs = Date.parse(entry.snapshot.collectedAt ?? "");
  const reference = Number.isFinite(collectedMs) ? collectedMs : entry.recordedAt;
  const ageSeconds = Math.max(0, Math.round((Date.now() - reference) / 1000));
  if (ageSeconds > maxAgeSeconds) return null;
  return entry.snapshot;
}

/**
 * Forget the cached snapshot for `hostId`. Used by the onboarding reset
 * flow so a re-installed agent doesn't accidentally serve stale data
 * from the deleted host's last push. Returns true when something was
 * actually removed.
 */
export function clearAgentSnapshot(hostId: string): boolean {
  return cache.delete(hostId);
}

/** Test-only: forget every cached snapshot. */
export function _resetAgentSnapshotCacheForTests(): void {
  cache.clear();
}

/** Diagnostics: number of cached hosts. */
export function agentSnapshotCacheSize(): number {
  return cache.size;
}
