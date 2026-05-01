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

type GlobalWithJobs = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, ScanJobRecord>;
};

function jobs(): Map<string, ScanJobRecord> {
  const g = globalThis as GlobalWithJobs;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map();
  return g[GLOBAL_KEY];
}

export function enqueueScan(hostIds: string[]): ScanJobRecord {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `scan-${Date.now()}`;
  const rec: ScanJobRecord = { id, createdAt: Date.now(), hostIds };
  jobs().set(id, rec);
  return rec;
}

export function resolveScan(
  id: string,
  status: "succeeded" | "failed",
  detail: string,
  driftCount?: number,
): void {
  const rec = jobs().get(id);
  if (!rec) return;
  rec.resolvedStatus = status;
  rec.resolvedAt = Date.now();
  rec.resolvedDetail = detail;
  if (driftCount !== undefined) rec.driftCount = driftCount;
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
