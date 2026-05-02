import * as fs from "fs";
import * as path from "path";

export type ScanJobStatus = "queued" | "running" | "succeeded" | "failed";

export type ScanJobRecord = {
  id: string;
  createdAt: number;
  hostIds: string[];
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

type GlobalWithJobs = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, ScanJobRecord>;
  [RUNNING_KEY]?: Set<string>;
};

// ---------------------------------------------------------------------------
// Graceful shutdown — drain in-flight scans before process.exit(0)
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
}

export function getScanRecord(id: string): ScanJobRecord | undefined {
  return jobs().get(id);
}

/** Derive live status — uses real resolution when available, else clock-based mock. */
export function projectScanJob(rec: ScanJobRecord): {
  id: string;
  status: ScanJobStatus;
  progress: number;
  detail: string;
  host_ids: string[];
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
    };
  }

  const elapsed = Date.now() - rec.createdAt;
  let status: ScanJobStatus = "queued";
  let progress = 0;
  let detail = "Enqueueing collectors…";

  if (elapsed > 250) {
    status = "running";
    progress = Math.min(99, Math.floor((elapsed - 250) / 35));
    detail =
      progress < 33
        ? "Enumerating listeners and persistence…"
        : progress < 66
          ? "Collecting SSH, firewall, identity slices…"
          : "Merging snapshot · computing drift…";
  }

  if (elapsed > 3500) {
    status = "succeeded";
    progress = 100;
    detail = "Snapshot merged · drift engine idle";
  }

  return {
    id: rec.id,
    status,
    progress,
    detail,
    host_ids: rec.hostIds,
  };
}
