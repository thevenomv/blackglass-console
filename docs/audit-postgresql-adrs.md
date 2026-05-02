# ADR sketch — PostgreSQL-backed audit append log

Today: in-memory (`readAudit`), optional **`AUDIT_LOG_PATH`** JSON array, optional **Spaces** `audit/*.jsonl`.

## When Postgres makes sense

- Multi-instance reads without sticky sessions  
- Regulatory export by `ts` range with indexed queries  
- Retention policies (partition by month)

## Minimal schema

| Column       | Type        | Notes |
|-------------|------------|-------|
| `id`        | `uuid` PK  | Mirrors `AuditEntry.id` |
| `ts`        | `timestamptz` | From `AuditEntry.ts` |
| `action`    | `text`     | Index for filtered exports |
| `detail`    | `text`     | |
| `actor`     | `text` null | |
| `scan_id`   | `text` null | |
| `request_id`| `text` null | Correlate **`x-request-id`** |

Implementation would add `appendAuditPg()` behind **`AUDIT_DATABASE_URL`** (never commit). Keep JSONL exporter for SOC2-ish handoff unchanged.
