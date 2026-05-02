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
| `request_id`| `text` null | Optional future column for **`x-request-id`** correlation |

Runtime: set **`AUDIT_DATABASE_URL`** → server appends via **`src/lib/server/audit-append-pg.ts`** (lazy `pg` Pool). Apply **`docs/migrations/001_audit_events.sql`** once per database.

Export tooling: **`npm run audit:export-spaces`** + **`npm run audit:verify-jsonl`** (stdin or file).
