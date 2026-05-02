/**
 * Token-bucket–style limits per client key. In-memory buckets are used when
 * **`RATE_LIMIT_REDIS_URL`** is unset, in tests, or when Redis errors (fail-open to local state).
 */

type Bucket = number[];

const buckets = new Map<string, Bucket>();

/** Clears in-memory buckets — **Vitest only** (rate limit state is otherwise process-global). */
export function resetRateLimitBucketsForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetRateLimitBucketsForTests is only for unit tests");
  }
  buckets.clear();
}

function prune(now: number, windowMs: number, arr: Bucket): Bucket {
  return arr.filter((t) => now - t < windowMs);
}

function allowMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const pruned = prune(now, windowMs, buckets.get(key) ?? []);
  if (pruned.length >= limit) {
    buckets.set(key, pruned);
    return false;
  }
  pruned.push(now);
  buckets.set(key, pruned);
  return true;
}

async function allowHybrid(key: string, limit: number, windowMs: number): Promise<boolean> {
  const { allowRedisSlidingWindow } = await import("./rate-limit-redis");
  const redis = await allowRedisSlidingWindow(key, limit, windowMs);
  if (redis !== null) return redis;
  return allowMemory(key, limit, windowMs);
}

export function clientIp(request: Request): string {
  // X-Real-IP is set by DigitalOcean / nginx to the originating client IP and
  // cannot be spoofed by the client once the LB strips incoming headers.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // X-Forwarded-For: "client, proxy1, proxyN". Take the LAST entry — appended
  // by the trusted downstream proxy — so a client-supplied forged prefix is ignored.
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const parts = xf
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return "local";
}

/** POST /api/v1/scans — enqueue abuse guard */
export function checkScanPostRate(ip: string): Promise<boolean> {
  return allowHybrid(`scan:post:${ip}`, 24, 60_000);
}

/** GET /api/v1/scans/:id — polling guard */
export function checkScanPollRate(ip: string): Promise<boolean> {
  return allowHybrid(`scan:get:${ip}`, 320, 60_000);
}

/** GET /api/health?probe=secrets — avoid hammering external secret backends */
export function checkHealthSecretsProbeRate(ip: string): Promise<boolean> {
  return allowHybrid(`health:secrets:${ip}`, 12, 60_000);
}

/**
 * POST login — brute-force guard.
 * 10 attempts per IP per 15 minutes.
 * Returns false when the caller should be blocked.
 */
export function checkLoginRate(ip: string): Promise<boolean> {
  return allowHybrid(`login:${ip}`, 10, 15 * 60_000);
}

/**
 * GET /api/auth/invite — token-enumeration guard.
 * 10 attempts per IP per minute.
 */
export function checkInviteRate(ip: string): Promise<boolean> {
  return allowHybrid(`invite:${ip}`, 10, 60_000);
}

/**
 * POST /api/v1/ingest — per-host push-agent flood guard.
 * 120 ingests per host_id per minute (2/s sustained; handles bursts).
 */
export function checkIngestRate(hostId: string): Promise<boolean> {
  return allowHybrid(`ingest:${hostId}`, 120, 60_000);
}
