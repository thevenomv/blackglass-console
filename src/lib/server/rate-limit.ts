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
  if (redis !== null) {
    if (!redis) {
      console.warn(
        JSON.stringify({
          level: "security",
          event: "rate_limit_exceeded",
          backend: "redis",
          key,
          limit,
          windowMs,
        }),
      );
    }
    return redis;
  }
  const allowed = allowMemory(key, limit, windowMs);
  if (!allowed) {
    console.warn(
      JSON.stringify({
        level: "security",
        event: "rate_limit_exceeded",
        backend: "memory",
        key,
        limit,
        windowMs,
      }),
    );
  }
  return allowed;
}

function clientIpFromXff(xf: string | null): string | undefined {
  if (!xf) return undefined;
  const parts = xf
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // X-Forwarded-For: "client, proxy1, proxyN". Take the LAST entry — appended
  // by the trusted downstream proxy — so a client-supplied forged prefix is ignored.
  const last = parts[parts.length - 1];
  return last || undefined;
}

/**
 * Client IP from **`Headers`** (Server Actions, Route Handlers with `headers()`).
 * Prefer **`x-real-ip`** when set by DigitalOcean / nginx in front of App Platform.
 */
export function clientIpFromHeaders(h: Headers): string {
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const fromXff = clientIpFromXff(h.get("x-forwarded-for"));
  if (fromXff) return fromXff;
  return "local";
}

export function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
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

/** Clerk org invitation server actions — per IP throttle. */
export function checkSaasMemberInviteRate(ip: string): Promise<boolean> {
  return allowHybrid(`saas:invite:${ip}`, 24, 60_000);
}

/**
 * POST /api/v1/ingest — per-host push-agent flood guard.
 * 120 ingests per host_id per minute (2/s sustained; handles bursts).
 */
export function checkIngestRate(hostId: string): Promise<boolean> {
  return allowHybrid(`ingest:${hostId}`, 120, 60_000);
}

/**
 * POST /api/checkout — Stripe session creation guard.
 * 10 attempts per IP per minute to prevent Stripe API quota exhaustion.
 */
export function checkCheckoutRate(ip: string): Promise<boolean> {
  return allowHybrid(`checkout:${ip}`, 10, 60_000);
}

/**
 * POST /api/checkout/portal — billing portal session guard.
 * 10 attempts per IP per minute to prevent customer-ID enumeration.
 */
export function checkPortalRate(ip: string): Promise<boolean> {
  return allowHybrid(`portal:${ip}`, 10, 60_000);
}

/**
 * POST /api/v1/baselines — SSH capture guard.
 * 6 per IP per minute; each call fans out SSH to all collector hosts.
 */
export function checkBaselinesRate(ip: string): Promise<boolean> {
  return allowHybrid(`baselines:${ip}`, 6, 60_000);
}

/**
 * POST /api/v1/reports — report generation guard.
 * 6 per IP per minute; each generation reads drift events + audit log.
 */
export function checkReportsPostRate(ip: string): Promise<boolean> {
  return allowHybrid(`reports:${ip}`, 6, 60_000);
}

/**
 * POST /api/v1/audit/events — manual audit-append guard.
 * 30 per IP per minute.
 */
export function checkAuditPostRate(ip: string): Promise<boolean> {
  return allowHybrid(`audit:post:${ip}`, 30, 60_000);
}

/**
 * POST /api/v1/webhooks/test — outbound webhook delivery test guard.
 * 2 per IP per minute to prevent using the server as an HTTP relay.
 */
export function checkWebhooksTestRate(ip: string): Promise<boolean> {
  return allowHybrid(`webhooks:test:${ip}`, 2, 60_000);
}

/**
 * GET read-tier API endpoints — general authenticated read guard.
 * 240 requests per IP per minute (4/s sustained) covers normal UI polling
 * while blocking scraping / runaway clients.
 */
export function checkReadApiRate(ip: string): Promise<boolean> {
  return allowHybrid(`read:api:${ip}`, 240, 60_000);
}

/**
 * POST /api/checkout/webhook (Stripe) — webhook flood guard.
 * 120 per IP per minute; Stripe signature verification is the real control.
 */
export function checkStripeWebhookRate(ip: string): Promise<boolean> {
  return allowHybrid(`stripe:webhook:${ip}`, 120, 60_000);
}

/**
 * POST /api/webhooks/clerk — Clerk webhook flood guard.
 * 120 per IP per minute; Svix signature verification is the real control.
 */
export function checkClerkWebhookRate(ip: string): Promise<boolean> {
  return allowHybrid(`clerk:webhook:${ip}`, 120, 60_000);
}

/**
 * GET /api/saas/context — tenant context read guard.
 * 60 per IP per minute; called on every authenticated page load.
 */
export function checkSaasContextRate(ip: string): Promise<boolean> {
  return allowHybrid(`saas:ctx:${ip}`, 60, 60_000);
}

/**
 * POST /api/saas/demo-cta — demo interest submission guard.
 * 5 per IP per minute to prevent lead-spam.
 */
export function checkDemoCtaRate(ip: string): Promise<boolean> {
  return allowHybrid(`demo:cta:${ip}`, 5, 60_000);
}

/**
 * POST /api/auth/generate-invite — admin invite generation guard.
 * 10 per IP per hour; admin-only endpoint.
 */
export function checkGenerateInviteRate(ip: string): Promise<boolean> {
  return allowHybrid(`gen:invite:${ip}`, 10, 60 * 60_000);
}

/**
 * POST /api/v1/collector/keys/rotate — key rotation guard.
 * 5 per IP per hour; operator/admin-only, rate-limited to prevent churning secrets.
 */
export function checkKeyRotateRate(ip: string): Promise<boolean> {
  return allowHybrid(`key:rotate:${ip}`, 5, 60 * 60_000);
}
