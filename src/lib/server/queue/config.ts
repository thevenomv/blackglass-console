/**
 * Queue configuration — single source of truth for queue names, default
 * concurrency, retry policies, and retention counts.
 *
 * Both queue singletons (scan-queue.ts, sandbox-queue.ts) and worker entry
 * points (src/worker/*.ts) import from here so that any policy change is
 * applied uniformly across enqueuer and consumer.
 */

// ---------------------------------------------------------------------------
// Queue names
// ---------------------------------------------------------------------------

/**
 * Canonical BullMQ queue names.  Never hard-code these strings; always import
 * QUEUE_NAMES so that a rename touches exactly one place.
 */
export const QUEUE_NAMES = {
  /** SSH collection + drift computation — heavy, CPU/network intensive. */
  SCANS: "blackglass-scans",
  /** PDF/Markdown report generation — lighter, Spaces I/O bound. */
  REPORTS: "blackglass-reports",
  /** Evidence bundle assembly — lighter, Spaces I/O bound. */
  EVIDENCE: "blackglass-evidence",
  /** Sandbox lifecycle: provision, seed-drift, cleanup. */
  SANDBOX: "blackglass-sandbox",
  /** Outbound webhook delivery (Slack/PagerDuty/generic) with retries + DLQ. */
  WEBHOOKS: "blackglass-webhooks",
  /** Per-tenant data-export bundles (Spaces upload or inline JSON). */
  EXPORTS: "blackglass-exports",
  /** Maintenance jobs: retention sweeps, idempotency pruning, future ops crons. */
  MAINTENANCE: "blackglass-maintenance",
  /** Charon (cloud janitor): read-only inventory + idle scoring. */
  JANITOR: "blackglass-janitor",
} as const;

// ---------------------------------------------------------------------------
// Default concurrency per queue worker
// ---------------------------------------------------------------------------

/**
 * How many jobs a single worker process handles in parallel for each queue.
 *
 * These are the *static* defaults; scan-worker.ts applies an additional
 * dynamic RAM-based cap for SCANS (see scan-worker.ts and WORKER_MAX_MEM_MB).
 *
 * Override at runtime via WORKER_CONCURRENCY (scans) or
 * SANDBOX_WORKER_CONCURRENCY (sandbox).
 */
export const DEFAULT_CONCURRENCY = {
  SCANS: 4,
  SANDBOX: 2,
} as const;

// ---------------------------------------------------------------------------
// Retry / backoff policies per job category
// ---------------------------------------------------------------------------

/**
 * BullMQ `JobsOptions` fragments for retry policies.
 *
 * Usage:
 *   defaultJobOptions: { ...RETRY_POLICIES.scan, removeOnComplete: … }
 */
export const RETRY_POLICIES = {
  /** SSH fan-out scans: transient SSH errors are retriable; 3 attempts. */
  scan: {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 2_000 },
  },
  /** Sandbox lifecycle ops: Droplet API calls are retriable; 5 attempts. */
  sandboxProvision: {
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 5_000 },
  },
  /**
   * Sandbox seed-drift: phase seeding is somewhat idempotent (seed script is
   * re-runnable); 3 attempts.
   */
  sandboxSeed: {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 10_000 },
  },
  /** Sandbox cleanup: must eventually succeed to avoid orphaned Droplets. */
  sandboxCleanup: {
    attempts: 10,
    backoff: { type: "exponential" as const, delay: 30_000 },
  },
  /**
   * Outbound webhook delivery: receivers commonly rate-limit or 5xx
   * transiently.  6 attempts with exponential backoff covers ~10 minutes
   * before the job is moved to the failed set (acts as a DLQ).
   */
  webhook: {
    attempts: 6,
    backoff: { type: "exponential" as const, delay: 5_000 },
  },
  /**
   * Data export jobs: bundle assembly + Spaces upload. Transient Spaces
   * 5xx is retriable; 3 attempts with a long backoff because each attempt
   * re-collects the bundle and we'd rather fail visibly than thrash.
   */
  export: {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 30_000 },
  },
  /**
   * Maintenance jobs (retention sweep, etc.): single attempt — these run
   * on a repeatable schedule so a transient failure is recovered by the
   * next tick rather than an in-job retry.
   */
  maintenance: {
    attempts: 1,
  },
  /** Charon DO scans: external API bound; retry transient 5xx. */
  janitor: {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 15_000 },
  },
} as const;

// ---------------------------------------------------------------------------
// Retention limits
// ---------------------------------------------------------------------------

/**
 * How many completed/failed job records BullMQ keeps in Redis.
 * Trim aggressively to avoid unbounded Redis growth.
 */
export const RETENTION = {
  scans: { removeOnComplete: { count: 200 }, removeOnFail: { count: 100 } },
  sandbox: { removeOnComplete: { count: 100 }, removeOnFail: { count: 50 } },
  /** Keep 50 successful and 200 failed webhook deliveries for the DLQ UI. */
  webhooks: { removeOnComplete: { count: 50 }, removeOnFail: { count: 200 } },
  /** Keep 50 ready and 50 failed export jobs visible from the UI. */
  exports: { removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } },
  /** Maintenance is high-frequency repeatable; trim aggressively. */
  maintenance: { removeOnComplete: { count: 20 }, removeOnFail: { count: 20 } },
  janitor: { removeOnComplete: { count: 100 }, removeOnFail: { count: 50 } },
} as const;

// ---------------------------------------------------------------------------
// Memory-based SSH concurrency helper
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared Redis connection helper
// ---------------------------------------------------------------------------

/**
 * Build a BullMQ / ioredis connection options object from a Redis URL.
 * Adds `tls: { rejectUnauthorized: false }` for `rediss://` URLs so
 * managed-Redis deployments (DO Valkey, Redis Cloud, etc.) that present
 * self-signed certificates connect successfully. Import this helper in
 * every place that creates a Redis or BullMQ connection so TLS behaviour
 * is consistent across all workers and queue producers.
 */
export function redisConnectionFromUrl(url: string): { url: string; tls?: { rejectUnauthorized: false } } {
  return url.startsWith("rediss://")
    ? { url, tls: { rejectUnauthorized: false as const } }
    : { url };
}

// ---------------------------------------------------------------------------
// Memory-based SSH concurrency helper
// ---------------------------------------------------------------------------

/**
 * Calculates the maximum number of concurrent scan jobs this worker process
 * should run, capped by available memory.
 *
 * Each active SSH connection (plus the in-memory drift computation it drives)
 * consumes roughly 40–80 MB.  We budget WORKER_SSH_MB_PER_JOB (default 60 MB)
 * and reserve WORKER_RESERVED_MB (default 256 MB) for the runtime itself.
 *
 * The static WORKER_CONCURRENCY env var always takes precedence when set, so
 * operators can always override this heuristic.
 *
 * @example
 *   // Worker has 2 GB RAM, 256 MB reserved, 60 MB/job → floor((2048-256)/60) = 29
 *   // But WORKER_CONCURRENCY=4 in env → 4 wins.
 */
export function resolveWorkerConcurrency(staticDefault = DEFAULT_CONCURRENCY.SCANS): number {
  // Explicit override always wins.
  const explicit = process.env.WORKER_CONCURRENCY?.trim();
  if (explicit) {
    const n = parseInt(explicit, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Dynamic: RAM-based heuristic.
  try {
    const { totalmem } = require("node:os") as typeof import("os");
    const totalMb = Math.floor(totalmem() / (1024 * 1024));
    const reservedMb = parseInt(process.env.WORKER_RESERVED_MB ?? "256", 10);
    const mbPerJob = parseInt(process.env.WORKER_SSH_MB_PER_JOB ?? "60", 10);
    const ramCap = Math.max(1, Math.floor((totalMb - reservedMb) / mbPerJob));
    // Never exceed 32 — sshd MaxStartups default is 10:30:100.
    return Math.min(ramCap, 32, staticDefault * 4);
  } catch {
    return staticDefault;
  }
}
