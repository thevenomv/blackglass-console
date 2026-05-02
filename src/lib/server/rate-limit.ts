/**
 * In-memory token buckets per client key (adequate for demo / single-region stubs).
 */

type Bucket = number[];

const buckets = new Map<string, Bucket>();

function prune(now: number, windowMs: number, arr: Bucket): Bucket {
  return arr.filter((t) => now - t < windowMs);
}

function allow(key: string, limit: number, windowMs: number): boolean {
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

export function clientIp(request: Request): string {
  // X-Real-IP is set by DigitalOcean / nginx to the originating client IP and
  // cannot be spoofed by the client once the LB strips incoming headers.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // X-Forwarded-For: "client, proxy1, proxyN". Take the LAST entry — appended
  // by the trusted downstream proxy — so a client-supplied forged prefix is ignored.
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const parts = xf.split(",").map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return "local";
}

/** POST /api/v1/scans — enqueue abuse guard */
export function checkScanPostRate(ip: string): boolean {
  return allow(`scan:post:${ip}`, 24, 60_000);
}

/** GET /api/v1/scans/:id — polling guard */
export function checkScanPollRate(ip: string): boolean {
  return allow(`scan:get:${ip}`, 320, 60_000);
}

/** GET /api/health?probe=secrets — avoid hammering external secret backends */
export function checkHealthSecretsProbeRate(ip: string): boolean {
  return allow(`health:secrets:${ip}`, 12, 60_000);
}

/**
 * POST login — brute-force guard.
 * 10 attempts per IP per 15 minutes.
 * Returns false when the caller should be blocked.
 */
export function checkLoginRate(ip: string): boolean {
  return allow(`login:${ip}`, 10, 15 * 60_000);
}

/**
 * GET /api/auth/invite — token-enumeration guard.
 * 10 attempts per IP per minute.
 */
export function checkInviteRate(ip: string): boolean {
  return allow(`invite:${ip}`, 10, 60_000);
}
