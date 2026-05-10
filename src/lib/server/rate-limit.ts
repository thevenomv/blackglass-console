/**
 * Token-bucket–style limits per client key. In-memory buckets are used when
 * **`RATE_LIMIT_REDIS_URL`** is unset, in tests, or when Redis errors (fail-open to local state).
 */

import { createHash } from "node:crypto";

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
 *
 * !!! DEPLOYMENT REQUIREMENT — read before changing the trust boundary !!!
 *
 * Both branches below trust headers that a malicious client could otherwise
 * spoof in raw HTTP requests. The trust boundary is a reverse proxy (DO App
 * Platform's load balancer, nginx, Cloudflare) that **strips and replaces**
 * any client-supplied `x-real-ip` and `x-forwarded-for` headers before
 * forwarding to Next.js.
 *
 * If this app is ever exposed directly to the internet (no proxy in front),
 * an attacker can:
 *   - Send `x-real-ip: 1.2.3.4` with every request to bypass per-IP rate
 *     limits by rotating the spoofed value.
 *   - Pin every request to one shared IP to lock legitimate users out.
 *
 * Operators: verify in `app.yaml` (DO) / nginx.conf / equivalent that the
 * proxy unconditionally rewrites these headers. The current DO App Platform
 * default does this correctly; a custom deploy must replicate it.
 *
 * The XFF helper takes the LAST entry (proxy-appended) rather than the
 * first (client-appendable), which makes XFF-only deployments somewhat
 * defensible — but the `x-real-ip` shortcut bypasses XFF entirely and
 * has no such defence. Stripping at the edge is the only safe answer.
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

/** POST /api/v1/scans — per-IP enqueue abuse guard (anonymous + authenticated). */
export function checkScanPostRate(ip: string): Promise<boolean> {
  return allowHybrid(`scan:post:${ip}`, 24, 60_000);
}

/**
 * POST /api/v1/scans — per-tenant enqueue guard (authenticated requests).
 *
 * Sits ALONGSIDE the per-IP guard so a single tenant rotating through
 * proxies / serverless egress IPs cannot drown the BullMQ queue and
 * starve other tenants. Capped at 60 enqueues / minute / tenant —
 * generous for a real fleet, prohibitive for a runaway script. When
 * `BLACKGLASS_SCAN_TENANT_RATE_PER_MIN` is set on the deployment it
 * overrides the default (operators with one giant tenant can raise
 * it without rebuilding).
 */
export function checkScanPostRateForTenant(tenantId: string): Promise<boolean> {
  const limit = Number(process.env.BLACKGLASS_SCAN_TENANT_RATE_PER_MIN ?? "60");
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 60;
  return allowHybrid(`scan:post:tenant:${tenantId}`, safeLimit, 60_000);
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
 * POST /api/contact-sales — Enterprise lead intake guard.
 * 5 leads per IP per 10 min — generous enough for legitimate
 * "I made a typo, let me resubmit" but tight enough that scrapers
 * can't flood Slack #sales / fill the audit log with noise.
 */
export function checkContactSalesRate(ip: string): Promise<boolean> {
  return allowHybrid(`contact-sales:${ip}`, 5, 600_000);
}

/**
 * POST /api/tools/cloud-waste-report — public free-tool email-me-this guard.
 * 5 per IP per 10 min; same shape as contact-sales since both are anonymous
 * lead-shaped surfaces and we'd rather drop a duplicate than spam the audit
 * stream.
 */
export function checkToolsCloudWasteReportRate(ip: string): Promise<boolean> {
  return allowHybrid(`tools:cloud-waste-report:${ip}`, 5, 600_000);
}

/**
 * Per-recipient guard for POST /api/tools/cloud-waste-report.
 *
 * Defends against the only real abuse path on this endpoint: an attacker
 * rotating IPs (residential proxies, Tor, etc.) to mail-bomb a chosen
 * victim with our domain in the From line. The IP-based guard alone can't
 * stop that — 5/IP × N IPs scales linearly. A per-email cap doesn't.
 *
 * Limit: 1 per email per 24h. Generous enough that a legitimate user who
 * resubmits with a tweaked org name 30 seconds later just sees a polite
 * "you've already received this" — but tight enough that the same address
 * can never be flooded.
 *
 * Email is hashed (SHA-256, normalized lowercase + trimmed) BEFORE it
 * touches the rate-limit key. The Redis/in-memory bucket therefore holds
 * an opaque digest, never plaintext PII — so a memory dump or Redis SCAN
 * doesn't leak who-emailed-what. Email normalization deliberately does
 * NOT strip Gmail "+" addressing: `a+1@x.com` and `a@x.com` are different
 * inboxes from a delivery standpoint and we should treat them as such.
 */
export function checkToolsCloudWasteReportEmailRate(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return allowHybrid(`tools:cloud-waste-report:to:${digest}`, 1, 24 * 60 * 60 * 1000);
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
 * GET /api/public/sandbox-showcase — anonymous polling guard.
 *
 * The /demo/sandbox page polls every few seconds while open.  This is
 * tighter than the generic read-API limit (240/min) because the showcase
 * endpoint runs an extra DB read on every call and may auto-provision
 * Droplets — we'd rather a runaway tab time out than push the demo
 * environment over its quota.  60/min == one poll/sec sustained.
 */
export function checkSandboxShowcaseRate(ip: string): Promise<boolean> {
  return allowHybrid(`showcase:${ip}`, 60, 60_000);
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

/**
 * POST Charon scan — per linked account, per hour (default 10).
 * Override with BLACKGLASS_JANITOR_SCAN_PER_ACCOUNT_HOUR.
 */
export function checkJanitorScanRateForAccount(tenantId: string, accountId: string): Promise<boolean> {
  const limit = Number(process.env.BLACKGLASS_JANITOR_SCAN_PER_ACCOUNT_HOUR ?? "10");
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  return allowHybrid(`janitor:scan:${tenantId}:${accountId}`, safeLimit, 3_600_000);
}

/** POST /api/v1/janitor/accounts — token validation touches DO; keep tight. */
export function checkJanitorAccountPostRate(ip: string): Promise<boolean> {
  return allowHybrid(`janitor:account:post:${ip}`, 12, 60_000);
}

/**
 * POST /api/v1/janitor/cleanup and POST .../cleanup/approve — queue + approve
 * (cloud deletes on approve). Separate bucket from generic baselines so Charon
 * traffic cannot starve baseline capture quotas.
 */
export function checkJanitorCleanupPostRate(ip: string): Promise<boolean> {
  return allowHybrid(`janitor:cleanup:post:${ip}`, 20, 60_000);
}
