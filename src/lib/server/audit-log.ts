import * as fs from "fs";
import * as path from "path";

export type AuditEntry = {
  id: string;
  ts: string;
  action: string;
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
