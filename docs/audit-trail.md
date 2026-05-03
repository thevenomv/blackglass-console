# Audit trail (compliance-oriented notes)

BLACKGLASS records security-relevant actions via **`appendAudit`** in **`src/lib/server/audit-log.ts`**.

## Where data goes

| Mode | Behaviour |
|------|-----------|
| **In-memory default** | Last **500** events per process; lost on restart (demo / Stage 0). |
| **`AUDIT_LOG_PATH=/path/audit.json`** | Persisted JSON array on disk; mount a volume in Docker/DO. |
| **DigitalOcean Spaces** | If **`DO_SPACES_*`** + **`DO_SPACES_BUCKET`** are set — **append-style** **`audit/YYYY-MM-DD.jsonl`** (NDJSON lines). Fits export to SIEM blob pipelines. |
| **`AUDIT_DATABASE_URL`** (PostgreSQL) | Optional server-side append — run **`docs/migrations/001_audit_events.sql`** once; runtime uses **`src/lib/server/audit-append-pg.ts`** (lazy `pg` pool). |

API: **`GET /api/v1/audit/events`** returns the recent in-memory/list slice (`readAudit`). **Spaces JSONL is not streamed back automatically** — use object storage tooling for long-term retrieval. Spot-check tooling: **`npm run audit:export-spaces`** and **`npm run audit:verify-jsonl`** ([security-pentest-checklist.md](security-pentest-checklist.md)).

### PostgreSQL sink (optional)

Use when you need indexed exports by time range, multi-instance consistency, or retention partitioning (not required for single-node demos).

**Minimal schema** (applied via **`docs/migrations/001_audit_events.sql`**): `id` (uuid PK), `ts`, `action`, `detail`, `actor`, `scan_id`, `request_id` (correlate with **`x-request-id`** from `middleware.ts` when log shipping).

**SaaS tenants:** tenant-scoped audit for the Clerk workspace model lives in **`saas_audit_events`** (see **`docs/saas-clerk-rbac.md`**). The legacy **`blackglass_audit`** table and **`appendAudit`** path remain for Stage-0 / non-SaaS deployments.

## Hardening for pilots (SOC2-ish direction)

1. Prefer **Spaces JSONL + volume file** redundancy in production paths.
2. Restrict bucket policy to operator roles only; encrypt at rest per cloud defaults.
3. Add **immutable retention** / WORM tier if your compliance team requires non-rewrite guarantees (currently daily objects are overwritten on append for that key — architectural change if you need strict immutability).
4. Correlate **`x-request-id`** (middleware) with audit rows when log shipping.

This is **not** legal/compliance certification — tailor retention and access to your auditor’s checklist.
