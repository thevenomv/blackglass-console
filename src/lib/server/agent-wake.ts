/**
 * agent-wake — small operator-friendly mechanism for asking a
 * blackholed host's push-agent to publish its next snapshot
 * IMMEDIATELY, instead of waiting for the next 60-second timer tick.
 *
 * The model is intentionally pull-based:
 *   1. Operator (UI button or `POST /api/v1/hosts/:id/wake`) calls
 *      `requestWake(hostId)`, which sets a short-lived flag.
 *   2. Each host's `blackglass-agent-wake.timer` polls
 *      `GET /api/v1/agent/wake?hostId=...` every ~10s. When the flag
 *      is set the agent triggers an immediate push and the flag is
 *      cleared atomically (so the next tick doesn't double-push).
 *
 * Why pull (not push): Blackglass already serves the host; the host
 * already trusts our TLS + bearer-token API. Adding a long-poll /
 * push channel would mean an extra network round-trip for hosts
 * behind NAT (which is the whole point of the push-agent in the
 * first place). A 10s poll costs ~6 HTTP HEAD-equivalents per host
 * per minute — trivial vs the 1 push per minute the agent already
 * does.
 *
 * Storage:
 *   - When REDIS_QUEUE_URL is set, the flag lives in Redis at
 *     `bg:wake:<hostId>` with TTL = WAKE_FLAG_TTL_SECS. This makes
 *     the flag visible across web instances + the BullMQ worker.
 *   - Otherwise the flag lives in module-level state. Single-
 *     instance deployments (lab, self-hosted single-node) get the
 *     same UX without needing Redis.
 */

import Redis from "ioredis";

const WAKE_FLAG_TTL_SECS = (() => {
  const n = parseInt(process.env.AGENT_WAKE_TTL_SECS ?? "300", 10);
  return Number.isFinite(n) && n > 0 ? n : 300;
})();

function wakeKey(hostId: string): string {
  return `bg:wake:${hostId}`;
}

let _client: Redis | null = null;
function getRedis(): Redis | null {
  const url = process.env.REDIS_QUEUE_URL?.trim();
  if (!url) return null;
  if (_client) return _client;
  try {
    const tls = url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
    _client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      ...tls,
    });
    _client.on("error", (err) => {
      console.warn("[agent-wake] Redis client error:", err.message);
    });
  } catch (err) {
    console.error("[agent-wake] Redis init failed:", err);
    _client = null;
  }
  return _client;
}

// In-memory fallback for non-Redis deployments. Keyed by hostId, value
// is the wall-clock ms when the flag expires. We expire on read so the
// fallback doesn't slowly leak — there are at most O(hosts) entries
// in steady state.
const _memFlags = new Map<string, number>();

function memHasFlag(hostId: string): boolean {
  const expiresAt = _memFlags.get(hostId);
  if (expiresAt === undefined) return false;
  if (Date.now() >= expiresAt) {
    _memFlags.delete(hostId);
    return false;
  }
  return true;
}

/**
 * Mark the host as needing an immediate push. Idempotent — calling
 * twice in the TTL window is the same as calling once.
 *
 * Returns the storage layer used so callers can log it for support.
 */
export async function requestWake(hostId: string): Promise<"redis" | "memory"> {
  const client = getRedis();
  if (client) {
    try {
      await client.set(wakeKey(hostId), "1", "EX", WAKE_FLAG_TTL_SECS);
      return "redis";
    } catch (err) {
      console.error("[agent-wake] Redis set failed, falling back to memory:", err);
    }
  }
  _memFlags.set(hostId, Date.now() + WAKE_FLAG_TTL_SECS * 1_000);
  return "memory";
}

/**
 * Atomically check + clear the wake flag for `hostId`. Returns true
 * iff there was an outstanding wake request. Called by the agent's
 * wake-check timer on every poll.
 */
export async function consumeWake(hostId: string): Promise<boolean> {
  const client = getRedis();
  if (client) {
    try {
      // GETDEL is the cleanest atomic check-and-clear; it landed in
      // Redis 6.2 which our supported deployments comfortably
      // exceed. Falls back to a non-atomic GET+DEL if GETDEL is
      // unavailable, which is safe — at worst we double-trigger the
      // agent push (idempotent).
      const v = await (client as unknown as { getdel: (k: string) => Promise<string | null> })
        .getdel(wakeKey(hostId))
        .catch(async (err: unknown) => {
          console.warn("[agent-wake] GETDEL unsupported, using GET+DEL:", err);
          const got = await client.get(wakeKey(hostId));
          if (got) await client.del(wakeKey(hostId));
          return got;
        });
      if (v) return true;
      // Fall through to memory-flag check in case the request was
      // routed to a web instance that wrote to memory before Redis
      // came back online.
    } catch (err) {
      console.error("[agent-wake] Redis getdel failed:", err);
    }
  }
  if (memHasFlag(hostId)) {
    _memFlags.delete(hostId);
    return true;
  }
  return false;
}

/** Test-only: clear all flags. */
export function _resetWakeForTests(): void {
  _memFlags.clear();
  // Redis cleanup is the test's responsibility — it owns the URL.
}
