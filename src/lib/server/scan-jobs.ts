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

/** Fire-and-forget: write a terminal scan record to Redis (worker → web). */
function publishScanResultToRedis(rec: ScanJobRecord): void {
  const url = process.env.REDIS_QUEUE_URL?.trim();
  if (!url) return;
  void (async () => {
    try {
      const tlsOpts = url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
      const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, ...tlsOpts });
      await client.set(
        scanRedisKey(rec.id),
        JSON.stringify(rec),
        "EX",
        REDIS_SCAN_TTL_SECS,
      );
      client.disconnect();
    } catch (err) {
      console.error("[scan-jobs] Redis publish failed:", err);
    }
  })();
}

/**
 * Read a resolved scan record from Redis (web tier fallback when BullMQ
 * worker resolved the scan in a separate process).
 */
async function fetchScanFromRedis(id: string): Promise<ScanJobRecord | undefined> {
  const url = process.env.REDIS_QUEUE_URL?.trim();
  if (!url) return undefined;
  try {
    const tlsOpts = url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
    const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, ...tlsOpts });
    const raw = await client.get(scanRedisKey(id));
    client.disconnect();
    if (!raw) return undefined;
    return JSON.parse(raw) as ScanJobRecord;
  } catch (err) {
    console.error("[scan-jobs] Redis fetch failed:", err);
    return undefined;
  }
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
  const rec: ScanJobRecord = { id, createdAt: Date.now(), hostIds };
  jobs().set(id, rec);
  persist();
  markScanStarted(id);
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
  if (driftCount !== undefined) rec.driftCount = driftCount;
  persist();
  markScanDone(id);
  // Publish to Redis so the web tier can read the result when BullMQ worker
  // resolves a scan in a separate process.
  publishScanResultToRedis(rec);
}

/**
 * Mark this job as a real scan. Called by the scans route as soon as
 * `executeDriftScanJob` is dispatched (or queued to BullMQ). After this
 * point the elapsed-time projection won't fake a "succeeded" status —
 * only the actual `resolveScan` call from the collector will.
 */
export function markScanReal(id: string): void {
  const rec = jobs().get(id);
  if (!rec) return;
  rec.kind = "real";
  persist();
}

/**
 * Update the in-flight progress detail for a real scan (e.g. "waiting
 * for fresh agent push"). Surfaced to the polling client via
 * `projectScanJob`. Has no effect once `resolveScan` has been called.
 */
export function updateScanProgress(id: string, detail: string): void {
  const rec = jobs().get(id);
  if (!rec || rec.resolvedStatus) return;
  rec.progressDetail = detail;
  // We don't persist progress updates — they're transient and the next
  // resolveScan() will overwrite anyway. Skipping the disk write keeps
  // hot-loop progress publishers cheap.
}

export function getScanRecord(id: string): ScanJobRecord | undefined {
  return jobs().get(id);
}

/**
 * Async variant: checks the in-process Map first, then falls back to Redis
 * when REDIS_QUEUE_URL is set. Use this in poll routes to handle the case
 * where a BullMQ worker in a separate process resolved the scan.
 */
export async function getScanRecordWithFallback(
  id: string,
): Promise<ScanJobRecord | undefined> {
  const local = jobs().get(id);
  // If we have a terminal record locally, return it immediately.
  if (local?.resolvedStatus) return local;

  // If BullMQ is not active, don't attempt Redis.
  if (!process.env.REDIS_QUEUE_URL?.trim()) return local;

  // Try Redis — worker may have resolved the scan in another process.
  const remote = await fetchScanFromRedis(id);
  if (remote) {
    // Merge into local Map so subsequent sync calls also see it.
    jobs().set(id, remote);
    persist();
    return remote;
  }
  return local;
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

  return {
    id: rec.id,
    status,
    progress,
    detail,
    host_ids: rec.hostIds,
  };
}
