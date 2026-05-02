import * as fs from "fs";
import * as path from "path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// Typed audit actions — use these constants everywhere instead of raw strings
// so action names are refactorable and exhaustively documented.
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = {
  // Auth lifecycle
  AUTH_LOGIN_SUCCESS: "auth.login_success",
  AUTH_LOGIN_FAILED: "auth.login_failed",
  AUTH_LOGOUT: "auth.logout",

  // Invite lifecycle
  INVITE_GENERATED: "invite.generated",
  INVITE_REDEEMED: "invite.redeemed",
  INVITE_REJECTED: "invite.rejected",

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
  CHECKOUT_STARTED: "checkout.started",
  CHECKOUT_COMPLETED: "checkout.completed",

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
    console.error("[audit-log] Failed to persist to file:", err);
  }
}

// ---------------------------------------------------------------------------
// Spaces (S3-compatible) persistence — append-only daily JSONL
// audit/YYYY-MM-DD.jsonl — each line is a JSON-serialised AuditEntry.
// Fire-and-forget: never throws into the caller's stack.
// ---------------------------------------------------------------------------

function makeSpacesClient(): S3Client | null {
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  if (!key || !secret || !endpoint) return null;
  const region =
    process.env.DO_SPACES_REGION ?? new URL(endpoint).hostname.split(".")[0];
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  });
}

function auditSpacesKey(date: string): string {
  // date = YYYY-MM-DD
  return `audit/${date}.jsonl`;
}

async function appendToSpaces(entry: AuditEntry): Promise<void> {
  const client = makeSpacesClient();
  if (!client) return;
  const bucket = process.env.DO_SPACES_BUCKET ?? "";
  const date = entry.ts.slice(0, 10); // YYYY-MM-DD
  const key = auditSpacesKey(date);

  try {
    // Read existing content for the day (may not exist yet)
    let existing = "";
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      existing = (await res.Body?.transformToString()) ?? "";
    } catch {
      // File doesn't exist yet — start fresh
    }

    const line = JSON.stringify(entry);
    const updated = existing ? `${existing.trimEnd()}\n${line}\n` : `${line}\n`;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: updated,
        ContentType: "application/x-ndjson",
      }),
    );
  } catch (err) {
    console.error("[audit-log] Failed to persist to Spaces:", err);
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
  // Persist to Spaces asynchronously — never blocks the caller
  void appendToSpaces(entry);
  return entry;
}

export function readAudit(limit = 100): AuditEntry[] {
  return store().slice(0, Math.min(limit, MAX));
}
