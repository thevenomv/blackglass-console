# Audit trail (compliance-oriented notes)

## SaaS audit (primary)

The canonical audit plane in production is **`saas_audit_events`** —
per-tenant, append-only, RLS-scoped. Every privileged action emits a row
through `emitSaasAudit()` (`src/lib/saas/event-log.ts`). Prefer the string
constants in `AUDIT_ACTIONS` (`src/lib/server/audit-log.ts`) when emitting
from TypeScript so action names stay consistent (legacy file audit uses the
same constants where applicable).

**Charon cleanup (examples):** `AUDIT_ACTIONS.JANITOR_CLEANUP_REQUESTED`,
`JANITOR_CLEANUP_APPROVED`, `JANITOR_CLEANUP_REJECTED`,
`JANITOR_CLEANUP_BLOCKED_PROTECT_TAG`, `JANITOR_CLEANUP_BLOCKED_PROTECT_TAG_LIVE`,
`JANITOR_CLEANUP_EXECUTION_FAILED`.

- **Per-tenant filtering:** the audit log UI is RLS-scoped — operators
  only see their own org. Quick-filters: Auth, Settings, Webhooks, Drift.
- **Deterministic export:** `npm run audit:verify-jsonl` produces a
  stable NDJSON digest suitable for cold storage in S3 + Object Lock.
- **Spaces archive:** `npm run audit:export-spaces` ships JSONL slices
  to `audit/YYYY-MM-DD.jsonl` for SIEM blob pipelines.
- **Retention:** per-plan window; legal/billing rows are kept for the
  account lifetime. See `docs/data-retention-saas.md`.

## Legacy audit path (Stage-0 / non-SaaS)

For single-tenant / pre-SaaS deployments, `appendAudit()` writes to one
of these sinks:

| Mode | Behaviour |
|------|-----------|
| **In-memory default** | Last **500** events per process; lost on restart (demo / Stage 0). |
| **`AUDIT_LOG_PATH=/path/audit.json`** | Persisted JSON array on disk; mount a volume in Docker/DO. |
| **DigitalOcean Spaces** | When `DO_SPACES_*` + `DO_SPACES_BUCKET` are set — append-style `audit/YYYY-MM-DD.jsonl` (NDJSON lines). |
| **`AUDIT_DATABASE_URL` (PostgreSQL)** | Optional server-side append — run `docs/migrations/001_audit_events.sql` once; runtime uses `src/lib/server/audit-append-pg.ts` (lazy `pg` pool). |

API: `GET /api/v1/audit/events` returns the recent in-memory slice from
`readAudit()`. Spaces JSONL is not streamed back automatically — use
object storage tooling for long-term retrieval.

### PostgreSQL sink (legacy schema)

Use when you need indexed exports by time range, multi-instance
consistency, or retention partitioning on a single-tenant deployment
(not required for single-node demos).

**Minimal schema** (`docs/migrations/001_audit_events.sql`): `id` (uuid
PK), `ts`, `action`, `detail`, `actor`, `scan_id`, `request_id`
(correlate with `x-request-id` from `middleware.ts` when log shipping).

## Hardening for pilots (SOC2-ish direction)

1. **SaaS:** the primary store is `saas_audit_events` (Postgres, RLS).
   Use `npm run audit:verify-jsonl` to take periodic deterministic
   exports for off-system retention.
2. **Legacy:** prefer **Spaces JSONL + volume file** redundancy in
   production paths.
3. Restrict bucket policy to operator roles only; encrypt at rest per
   cloud defaults.
4. For WORM-grade retention, configure an OCSF outbound webhook to your
   own S3 + Object Lock bucket. We do not run an Object-Lock bucket on
   the customer's behalf.
5. Correlate `x-request-id` (set by `middleware.ts`) with audit rows
   when log shipping.

This is **not** legal/compliance certification — tailor retention and
access to your auditor's checklist.
