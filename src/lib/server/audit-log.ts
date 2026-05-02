import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Typed audit actions — use these constants everywhere instead of raw strings
// so action names are refactorable and exhaustively documented.
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = {
  // Baseline lifecycle
  BASELINE_CAPTURE: "baseline.capture",
  BASELINE_CAPTURE_FAILED: "baseline.capture_failed",

  // Scan lifecycle
  SCAN_STARTED: "scan.started",
  SCAN_COMPLETED: "scan.completed",
  SCAN_FAILED: "scan.failed",

  // Drift
  DRIFT_VIEWED: "drift.viewed",

  // Reports
  REPORT_QUEUED: "report.queued",
  REPORT_GENERATED: "report.generated",

  // Plan / billing
  PLAN_CHANGED: "plan.changed",
  PLAN_REVERTED: "plan.reverted",

  // Generic — prefer specific actions above when possible
  USER_ACTION: "user.action",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export type AuditEntry = {
  id: string;
  ts: string;
  action: AuditAction | string; // string fallback keeps the type open for external callers
  detail: string;
  actor?: string;
  /** Correlates server-emitted rows with `GET /api/v1/scans/:id` when present. */
  scan_id?: string;
};

const MAX = 500;

// ---------------------------------------------------------------------------
// File persistence helpers (opt-in via AUDIT_LOG_PATH env var)
// ---------------------------------------------------------------------------

function storePath(): string | undefined {
  return process.env.AUDIT_LOG_PATH;
}

function loadFromFile(filePath: string): AuditEntry[] {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const arr = JSON.parse(raw) as AuditEntry[];
    return Array.isArray(arr) ? arr.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function saveToFile(filePath: string, rows: AuditEntry[]): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(rows.slice(0, MAX), null, 2), "utf8");
  } catch (err) {
    console.error("[audit-log] Failed to persist:", err);
  }
}

// ---------------------------------------------------------------------------
// In-process store (process-global, loaded from file on first access)
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__blackglass_audit_log_v1" as const;
type G = typeof globalThis & { [GLOBAL_KEY]?: AuditEntry[] };

function store(): AuditEntry[] {
  const g = globalThis as G;
  if (!g[GLOBAL_KEY]) {
    const fp = storePath();
    g[GLOBAL_KEY] = fp ? loadFromFile(fp) : [];
  }
  return g[GLOBAL_KEY];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function appendAudit(
  row: Omit<AuditEntry, "id" | "ts"> & { ts?: string },
): AuditEntry {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    ts: row.ts ?? new Date().toISOString(),
    action: row.action,
    detail: row.detail,
    actor: row.actor,
    scan_id: row.scan_id,
  };
  const entries = store();
  entries.unshift(entry);
  if (entries.length > MAX) entries.length = MAX;
  const fp = storePath();
  if (fp) saveToFile(fp, entries);
  return entry;
}

export function readAudit(limit = 100): AuditEntry[] {
  return store().slice(0, Math.min(limit, MAX));
}
