/**
 * Optional distributed rate limiting when **`RATE_LIMIT_REDIS_URL`** is set (`rediss://` OK).
 * Sliding window via Redis sorted set + Lua (atomic prune / count / add).
 */

import Redis from "ioredis";
import { randomBytes } from "node:crypto";
import { redisConnectionFromUrl } from "@/lib/server/queue/config";

const REDIS_KEY = "__bgRateLimitRedis_v1" as const;
type G = typeof globalThis & { [REDIS_KEY]?: Redis };

/** Prune stale entries; if below limit, add `now` and allow; else deny. Returns 1 or 0. */
const LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local minScore = now - windowMs
redis.call('ZREMRANGEBYSCORE', key, '0', tostring(minScore))
local n = redis.call('ZCARD', key)
if tonumber(n) >= limit then return 0 end
redis.call('ZADD', key, tostring(now), member)
redis.call('PEXPIRE', key, windowMs + 1000)
return 1
`;

function singleton(): Redis | null {
  const url = process.env.RATE_LIMIT_REDIS_URL?.trim();
  if (!url || process.env.NODE_ENV === "test") return null;
  const g = globalThis as G;
  if (!g[REDIS_KEY]) {
    g[REDIS_KEY] = new Redis({
      ...redisConnectionFromUrl(url),
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
  }
  return g[REDIS_KEY]!;
}

/**
 * `true` = allowed; `false` = denied; **`null`** = Redis not configured or
 * error with fail-open behaviour. When `RATE_LIMIT_FAIL_CLOSED=true` and
 * Redis is configured but unavailable, returns `false` (deny) instead of
 * `null` (fall through to in-memory) so multi-replica deployments don't
 * silently multiply their effective rate limits per replica.
 */
export async function allowRedisSlidingWindow(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean | null> {
  const r = singleton();
  if (!r) return null;

  const now = Date.now();
  // Use cryptographically random bytes so sorted-set members are unguessable/unforgeable.
  const member = `${now}:${randomBytes(8).toString("hex")}`;
  try {
    const raw = await r.eval(
      LUA,
      1,
      key,
      String(now),
      String(windowMs),
      String(limit),
      member,
    );
    const n = typeof raw === "number" ? raw : Number(raw);
    return n === 1;
  } catch {
    // Redis is configured but errored. When RATE_LIMIT_FAIL_CLOSED is set,
    // deny the request rather than falling back to per-process in-memory
    // buckets (which would give each replica its own independent limit).
    if (process.env.RATE_LIMIT_FAIL_CLOSED === "true") {
      return false;
    }
    return null;
  }
}

/** Stats entry for a single rate-limit key — active hit count within its window. */
export type RateLimitKeyStat = {
  key: string;
  activeHits: number;
};

/**
 * Scan Redis for all active rate-limit sorted-set keys and return their current
 * hit counts (number of members still inside the sliding window).
 *
 * Returns `null` when Redis is not configured.
 */
export async function getRateLimitStats(): Promise<RateLimitKeyStat[] | null> {
  const r = singleton();
  if (!r) return null;

  const stats: RateLimitKeyStat[] = [];
  let cursor = "0";

  try {
    do {
      const [nextCursor, keys] = await r.scan(cursor, "MATCH", "*:*", "COUNT", "200");
      cursor = nextCursor;
      for (const key of keys) {
        try {
          const count = await r.zcard(key);
          if (count > 0) stats.push({ key, activeHits: count });
        } catch {
          // Skip keys that error (may be a different type or expired mid-scan)
        }
      }
    } while (cursor !== "0");
  } catch {
    return null;
  }

  return stats.sort((a, b) => b.activeHits - a.activeHits);
}
