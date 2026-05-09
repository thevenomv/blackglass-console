import * as fs from "fs";
import * as path from "path";
import Redis from "ioredis";

export type ScanJobStatus = "queued" | "running" | "succeeded" | "failed";

export type ScanJobRecord = {
  id: string;
  createdAt: number;
  hostIds: string[];
  /**
   * "real" once a collector (in-process or BullMQ worker) has been
   * dispatched for this job. "mock" until then — used by sample-data /
   * collector-not-configured paths where no real drift computation
   * happens. Distinguishing the two prevents the elapsed-time
   * projection from synthesising "succeeded" while a real scan is
   * still in flight (the SSH path can take 15-30s to fall back to the
   * agent cache; the previous 3.5s projection lied about completion
   * and caused the dashboard to refresh BEFORE drift events landed).
   */
  kind?: "mock" | "real";
  /**
   * Optional progress signal published by the collector while it works
   * (e.g. "waiting_for_fresh_agent_push"). Surfaced in the UI so users
   * understand why the scan is taking longer than a few seconds.
   */
  progressDetail?: string;
  /** Actual terminal status when real collection is used */
  resolvedStatus?: "succeeded" | "failed";
  resolvedAt?: number;
  resolvedDetail?: string;
  /** Number of drift events found (real scans only) */
  driftCount?: number;
  /**
   * Wall-clock ms of the most recent write to this record. Used by
   * the multi-instance merge logic in `getScanRecordWithFallback` to
   * decide which copy (local Map vs Redis) is newer when both exist.
   * Without this, a stale local copy could mask a fresher Redis copy
   * written by the BullMQ worker (or another web instance).
   */
  updatedAt?: number;
};

const GLOBAL_KEY = "__blackglass_scan_jobs_v1" as const;
// Tracks in-flight (unresolved) scan IDs so SIGTERM handler can drain them.
const RUNNING_KEY = "__blackglass_running_scans_v1" as const;

const MAX_JOBS = 200;

/** Minimum elapsed time (ms) before a job transitions from queued to running. */
const SCAN_PROGRESS_MIN_DELAY_MS = 250;
/** Progress bar increment per ms of elapsed time (yields 0–99% over ~3.5 s). */
const SCAN_PROGRESS_INTERVAL_MS = 35;

/** TTL for Redis scan-result keys: configurable via SCAN_REDIS_TTL_SECS (default 24 hours). */
const REDIS_SCAN_TTL_SECS = (() => {
  const n = parseInt(process.env.SCAN_REDIS_TTL_SECS ?? "86400", 10);
  return Number.isFinite(n) && n > 0 ? n : 86400;
})();

type GlobalWithJobs = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, ScanJobRecord>;
  [RUNNING_KEY]?: Set<string>;
};

// ---------------------------------------------------------------------------
// Redis helpers (BullMQ cross-process scan state) — lazy dynamic import so
// ioredis is never loaded in builds that don't set REDIS_QUEUE_URL.
// ---------------------------------------------------------------------------

function scanRedisKey(id: string): string {
  return `bg:scan:${id}`;
}

/**
 * Singleton Redis client for scan-job state (separate from BullMQ's
 * own connection so it can be dropped without affecting queue health).
 *
 * Lazy-initialised: only opened when REDIS_QUEUE_URL is set AND the
 * first publish/fetch happens. Connection is reused across calls so
 * we avoid the "open + auth + close" cost on every progress tick.
 */
let _redisClient: Redis | null = null;
function getRedisForScans(): Redis | null {
  const url = process.env.REDIS_QUEUE_URL?.trim();
  if (!url) return null;
  if (_redisClient) return _redisClient;
  try {
    const tlsOpts = url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
    _redisClient = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      ...tlsOpts,
    });
    _redisClient.on("error", (err) => {
      // Silence per-call noise; we always treat Redis as best-effort
      // and fall back to local state when it's unreachable.
      console.warn("[scan-jobs] Redis client error:", err.message);
    });
  } catch (err) {
    console.error("[scan-jobs] Redis client init failed:", err);
    _redisClient = null;
  }
  return _redisClient;
}

/**
 * Fire-and-forget: publish the FULL current record to Redis so other
 * web instances + the worker can see in-flight state (kind, progress,
 * resolution). Called on every state-changing write — enqueue,
 * markScanReal, updateScanProgress, resolveScan. The cost is one
 * SET per change, which is trivial vs the wins of cross-instance
 * consistency. Errors are logged once and swallowed.
 *
 * Why publish in-flight state (not just terminal): without this, an
 * instance that didn't enqueue the scan can't see `kind="real"` or
 * `progressDetail` — its projection then reverts to the mock-mode
 * 3.5s elapsed-time fake-success branch, and the dashboard refreshes
 * before drift events land. This is the same root cause as the
 * earlier "100% baseline alignment" bug, just at the multi-instance
 * layer.
 */
function publishScanRecordToRedis(rec: ScanJobRecord): void {
  const client = getRedisForScans();
  if (!client) return;
  void (async () => {
    try {
      await client.set(
        scanRedisKey(rec.id),
        JSON.stringify(rec),
        "EX",
        REDIS_SCAN_TTL_SECS,
      );
    } catch (err) {
      console.error("[scan-jobs] Redis publish failed:", err);
    }
  })();
}

/**
 * Read whatever copy of the record Redis has. Returns undefined when
 * Redis is unreachable or the key has expired/never existed.
 */
async function fetchScanFromRedis(id: string): Promise<ScanJobRecord | undefined> {
  const client = getRedisForScans();
  if (!client) return undefined;
  try {
    const raw = await client.get(scanRedisKey(id));
    if (!raw) return undefined;
    return JSON.parse(raw) as ScanJobRecord;
  } catch (err) {
    console.error("[scan-jobs] Redis fetch failed:", err);
    return undefined;
  }
}

/**
 * Pick the "newer" of two records using the same merge rule the
 * polling client implicitly assumes:
 *   1. A record with `resolvedStatus` always wins over one without
 *      (terminal state is the source of truth).
 *   2. Otherwise the record with the larger `updatedAt` wins.
 *   3. If both lack `updatedAt`, the local copy wins (it's at least
 *      definitely real).
 *
 * Used by `getScanRecordWithFallback` so a stale local cache can't
 * mask a fresher Redis copy written by another instance.
 */
function pickNewerScanRecord(
  a: ScanJobRecord | undefined,
  b: ScanJobRecord | undefined,
): ScanJobRecord | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.resolvedStatus && !b.resolvedStatus) return a;
  if (b.resolvedStatus && !a.resolvedStatus) return b;
  const aT = a.updatedAt ?? 0;
  const bT = b.updatedAt ?? 0;
  return aT >= bT ? a : b;
}
// ---------------------------------------------------------------------------

const DRAIN_TIMEOUT_MS = 8_000; // max wait for running scans to finish

let _shutdownRegistered = false;

function registerShutdownHandler() {
  if (_shutdownRegistered) return;
  _shutdownRegistered = true;

  const handler = (signal: string) => {
    const running = (globalThis as GlobalWithJobs)[RUNNING_KEY];
    if (!running || running.size === 0) {
      console.info(`[scan-jobs] ${signal}: no active scans — exiting cleanly`);
      process.exit(0);
    }

    console.info(`[scan-jobs] ${signal}: waiting for ${running.size} scan(s) to finish...`);
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;

    const poll = setInterval(() => {
      if (running.size === 0 || Date.now() > deadline) {
        clearInterval(poll);
        if (running.size > 0) {
          console.warn(`[scan-jobs] ${signal}: drain timeout — ${running.size} scan(s) still running`);
        } else {
          console.info(`[scan-jobs] ${signal}: all scans finished — exiting cleanly`);
        }
        process.exit(0);
      }
    }, 250);
  };

  process.once("SIGTERM", () => handler("SIGTERM"));
  process.once("SIGINT", () => handler("SIGINT"));
}

function runningScans(): Set<string> {
  const g = globalThis as GlobalWithJobs;
  if (!g[RUNNING_KEY]) g[RUNNING_KEY] = new Set();
  return g[RUNNING_KEY];
}

/** Call before starting SSH collection for a job. */
export function markScanStarted(id: string): void {
  runningScans().add(id);
}

/** Call when a scan reaches a terminal state (success or failure). */
export function markScanDone(id: string): void {
  runningScans().delete(id);
}

// ---------------------------------------------------------------------------
// File persistence helpers (opt-in via SCAN_JOBS_PATH env var)
// ---------------------------------------------------------------------------

function storePath(): string | undefined {
  return process.env.SCAN_JOBS_PATH;
}

function loadFromFile(filePath: string): Map<string, ScanJobRecord> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const arr = JSON.parse(raw) as ScanJobRecord[];
    return new Map(arr.map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

function saveToFile(filePath: string, map: Map<string, ScanJobRecord>): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Persist only terminal / recent jobs — cap at MAX_JOBS newest by createdAt.
    const sorted = [...map.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_JOBS);
    fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2), "utf8");
  } catch (err) {
    console.error("[scan-jobs] Failed to persist:", err);
  }
}

function jobs(): Map<string, ScanJobRecord> {
  const g = globalThis as GlobalWithJobs;
  if (!g[GLOBAL_KEY]) {
    const fp = storePath();
    g[GLOBAL_KEY] = fp ? loadFromFile(fp) : new Map();
  }
  return g[GLOBAL_KEY];
}

function persist(): void {
  const fp = storePath();
  if (fp) saveToFile(fp, jobs());
}

export function enqueueScan(hostIds: string[]): ScanJobRecord {
  registerShutdownHandler();
  const store = jobs();
  if (store.size >= MAX_JOBS) {
    throw new Error(`[scan-jobs] Job limit reached (${MAX_JOBS}). Try again once existing jobs complete.`);
  }
  if (store.size >= Math.floor(MAX_JOBS * 0.8)) {
    console.warn(`[scan-jobs] Job store at ${store.size}/${MAX_JOBS} capacity`);
  }
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `scan-${Date.now()}`;
  const rec: ScanJobRecord = { id, createdAt: Date.now(), hostIds, updatedAt: Date.now() };
  jobs().set(id, rec);
  persist();
  markScanStarted(id);
  publishScanRecordToRedis(rec);
  return rec;
}

export function resolveScan(
  id: string,
  status: "succeeded" | "failed",
  detail?: string,
  driftCount?: number,
): void {
  const rec = jobs().get(id);
  if (!rec) return;
  rec.resolvedStatus = status;
  rec.resolvedAt = Date.now();
  rec.resolvedDetail = detail;
  rec.updatedAt = Date.now();
  if (driftCount !== undefined) rec.driftCount = driftCount;
  persist();
  markScanDone(id);
  publishScanRecordToRedis(rec);
}

/**
 * Mark this job as a real scan. Called by the scans route as soon as
 * `executeDriftScanJob` is dispatched (or queued to BullMQ). After this
 * point the elapsed-time projection won't fake a "succeeded" status —
 * only the actual `resolveScan` call from the collector will.
 *
 * Cross-instance: also publishes to Redis so a poll routed to a
 * different web instance still sees `kind="real"` and waits for the
 * actual resolution instead of synthesising "succeeded" at 3.5s.
 */
export function markScanReal(id: string): void {
  const rec = jobs().get(id);
  if (!rec) return;
  rec.kind = "real";
  rec.updatedAt = Date.now();
  persist();
  publishScanRecordToRedis(rec);
}

/**
 * Update the in-flight progress detail for a real scan (e.g. "waiting
 * for fresh agent push"). Surfaced to the polling client via
 * `projectScanJob`. Has no effect once `resolveScan` has been called.
 *
 * Cross-instance: also publishes to Redis so the polling client sees
 * the same progress message regardless of which web instance serves
 * the poll. This is what makes the "Waiting for fresh agent
 * snapshot…" message reliable when the collector runs in the
 * BullMQ worker (separate process) and polls hit the web tier.
 */
export function updateScanProgress(id: string, detail: string): void {
  const rec = jobs().get(id);
  if (!rec || rec.resolvedStatus) return;
  rec.progressDetail = detail;
  rec.updatedAt = Date.now();
  // Skip the disk persist — progress updates are high-frequency and
  // we already publish to Redis (which polling clients consult).
  publishScanRecordToRedis(rec);
}

export function getScanRecord(id: string): ScanJobRecord | undefined {
  return jobs().get(id);
}

/**
 * Async variant used by poll routes: returns the FRESHER of the local
 * Map and the Redis copy. Critical for multi-instance correctness —
 * the BullMQ worker (or a different web instance) may have updated
 * `kind`, `progressDetail`, or `resolvedStatus` since the local
 * record was created.
 */
export async function getScanRecordWithFallback(
  id: string,
): Promise<ScanJobRecord | undefined> {
  const local = jobs().get(id);

  // No Redis configured — local Map is all we have.
  if (!process.env.REDIS_QUEUE_URL?.trim()) return local;

  const remote = await fetchScanFromRedis(id);
  const newer = pickNewerScanRecord(local, remote);
  // Mirror the newer copy back into the local Map so subsequent
  // synchronous reads (and the SIGTERM drain) see the same state.
  if (newer && newer !== local) {
    jobs().set(id, newer);
    persist();
  }
  return newer;
}

/** Derive live status — uses real resolution when available, else clock-based mock. */
export function projectScanJob(rec: ScanJobRecord): {
  id: string;
  status: ScanJobStatus;
  progress: number;
  detail: string;
  host_ids: string[];
  /** Drift count once the scan has resolved; undefined while running. */
  eventsFound?: number;
} {
  // Real collector already finished
  if (rec.resolvedStatus) {
    return {
      id: rec.id,
      status: rec.resolvedStatus,
      progress: rec.resolvedStatus === "succeeded" ? 100 : 0,
      detail: rec.resolvedDetail ?? (rec.resolvedStatus === "succeeded"
        ? `Snapshot merged · ${rec.driftCount ?? 0} drift signal${rec.driftCount !== 1 ? "s" : ""} found`
        : "Collection failed"),
      host_ids: rec.hostIds,
      eventsFound: rec.driftCount,
    };
  }

  const elapsed = Date.now() - rec.createdAt;
  let status: ScanJobStatus = "queued";
  let progress = 0;
  let detail = "Enqueueing collectors…";

  if (elapsed > SCAN_PROGRESS_MIN_DELAY_MS) {
    status = "running";
    progress = Math.min(99, Math.floor((elapsed - SCAN_PROGRESS_MIN_DELAY_MS) / SCAN_PROGRESS_INTERVAL_MS));
    detail =
      progress < 33
        ? "Enumerating listeners and persistence…"
        : progress < 66
          ? "Collecting SSH, firewall, identity slices…"
          : "Merging snapshot · computing drift…";
  }

  // Synthesised completion is ONLY safe in mock / sample-data mode where
  // no real collector ever calls resolveScan(). For real scans we wait
  // for the actual resolveScan() call from `executeDriftScanJob` —
  // otherwise the client thinks the scan finished before drift events
  // are stored, refreshes the dashboard with stale data, and stops
  // polling (so the real result never surfaces). See
  // src/components/providers/ScanJobsProvider.tsx for the polling loop.
  if (rec.kind !== "real" && elapsed > 3500) {
    status = "succeeded";
    progress = 100;
    detail = "Snapshot merged · drift engine idle";
  }

  // Real scans cap at 99% running with whatever live detail the
  // collector last published. This makes long-running flows
  // (SSH-fail → wait for fresh agent push) understandable: the user
  // sees "Waiting for next agent push (3m left)..." instead of a
  // mysterious silent stall.
  if (rec.kind === "real" && status === "running" && rec.progressDetail) {
    detail = rec.progressDetail;
  }

  // Stalled-scan diagnostic. If a real scan has been queued for more
  // than ~30 s with no progress detail published yet, surface a clear
  // message instead of the generic "Enumerating listeners…" so the
  // user understands something is wrong. This catches the
  // "REDIS_QUEUE_URL set but no scan-worker deployed" failure mode
  // even when the per-request fallback in /api/v1/scans somehow
  // misses (e.g. the worker was up at enqueue time but died before
  // picking the job up).
  if (
    rec.kind === "real" &&
    status === "running" &&
    !rec.progressDetail &&
    elapsed > SCAN_STALL_HINT_MS
  ) {
    detail =
      `Scan has been running for ${Math.round(elapsed / 1000)}s with no progress signal. ` +
      `If this persists, check the scan-worker process is running and connected to Redis.`;
  }

  return {
    id: rec.id,
    status,
    progress,
    detail,
    host_ids: rec.hostIds,
  };
}

/**
 * Threshold above which `projectScanJob` flips from a generic "running"
 * detail to an explicit "no progress signal yet" warning. 30s is well
 * past the longest happy-path leg (SSH 75s only fires if SSH actually
 * starts; if the worker is dead, we never even get to SSH), so seeing
 * this message is a strong signal that something is wrong.
 */
const SCAN_STALL_HINT_MS = 30_000;
