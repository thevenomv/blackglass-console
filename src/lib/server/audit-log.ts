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
const entries: AuditEntry[] = [];

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
  entries.unshift(entry);
  if (entries.length > MAX) entries.length = MAX;
  return entry;
}

export function readAudit(limit = 100): AuditEntry[] {
  return entries.slice(0, Math.min(limit, MAX));
}
