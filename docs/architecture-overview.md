# BLACKGLASS Architecture Overview

> **Audience**: Engineers onboarding to this codebase.  
> **Goal**: Define the layers, their responsibilities, the rules between them, and the key invariants that must never be broken.

---

## 1. Layer Map

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Presentation                                                            │
│  src/app/(marketing)/**   — public/marketing pages                      │
│  src/app/(app)/**         — authenticated dashboard                      │
│  src/components/**        — React components                             │
├──────────────────────────────────────────────────────────────────────────┤
│  Transport                                                               │
│  src/app/api/**           — Next.js Route Handlers (HTTP API surface)    │
│  src/lib/server/http/**   — HTTP helpers (json-error, saas-access, etc.) │
├──────────────────────────────────────────────────────────────────────────┤
│  Application Services                                                    │
│  src/lib/server/services/**     — scan orchestration, evidence assembly, │
│                                   sandbox provisioner, baseline capture, │
│                                   Charon (janitor) scan + cleanup        │
│  src/lib/server/collector/**    — SSH fan-out + parser pipeline           │
│  src/lib/server/drift-engine.ts — drift computation                      │
│  src/lib/server/inventory.ts    — host inventory                         │
│  src/lib/server/outbound-webhook.ts — event delivery to external SIEMs  │
├──────────────────────────────────────────────────────────────────────────┤
│  Async / Workers                                                         │
│  src/lib/server/queue/**  — BullMQ queue singletons + config             │
│  src/worker/scan-worker.ts    — SSH + drift consumer (isolated process)  │
│  src/worker/ops-worker.ts     — webhooks, exports, maintenance, Charon  │
│                                janitor queue (cloud inventory scans)      │
│  src/worker/sandbox-worker.ts — sandbox lifecycle consumer               │
├──────────────────────────────────────────────────────────────────────────┤
│  Persistence & Infrastructure                                            │
│  src/db/**                — Drizzle ORM, schema, RLS helpers             │
│  src/lib/server/store/**  — baseline + drift-history repositories        │
│  src/lib/server/secrets/** — pluggable credential providers              │
│  External: Postgres, DigitalOcean Spaces, Redis/Valkey, DO API           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Rules Between Layers

| From → To | Allowed? | Notes |
|-----------|----------|-------|
| Component → API Route | ✅ | via `fetch()` |
| Component → DB / Store / Secrets | ❌ | Never directly — always via an API route |
| API Route → Service | ✅ | Primary call pattern |
| API Route → DB | ✅ | Acceptable for thin CRUD routes; prefer services for complex logic |
| API Route → Queue | ✅ | For async job dispatch (scan, sandbox lifecycle) |
| Service → DB | ✅ | Must use `withTenantRls()` for tenant-scoped data |
| Service → Store | ✅ | Baseline + drift-history repositories |
| Service → Secrets | ✅ | For SSH credential retrieval |
| Service → Queue | ✅ | For chaining async steps (e.g. provision → seed → cleanup) |
| Worker → Service | ✅ | Workers call the same services the web tier uses |
| Worker → DB | ✅ | Must use `withBypassRls()` only where explicitly documented |
| Worker → HTTP API | ❌ | Workers are internal; they never call the web tier's HTTP API |

---

## 3. Key Invariants

### Multi-tenancy & RLS

- **All** tenant-scoped DB reads/writes go through `withTenantRls(tenantId, fn)`.
- `withBypassRls()` is reserved for:
  - **Worker processes** that handle jobs across tenants and cannot set a session-level RLS variable.
  - **Admin/break-glass scripts** (`scripts/blackglassctl.mjs`).
  - **Webhook handlers** (Stripe, Clerk) that act before a tenant context is established.
- Every new table that holds tenant data **must** have:
  1. A `tenant_id` foreign key to `saas_tenants.id`.
  2. A `SELECT` and `INSERT/UPDATE/DELETE` RLS policy gating on `current_setting('app.tenant_id')`. Migration `drizzle/0016_consolidate_rls_gucs.sql` aligned every shipped policy onto the canonical `(app.tenant_id, app.bypass_rls)` GUC pair — model new policies after the `_v2` policies in that migration. See `docs/security-compliance.md` § 3 for the operator-facing RLS story.
- Application code never connects with a Postgres superuser or owner role — only the `app_user` role.

### SSH / Collector

- All SSH collection runs **off the web process** in `scan-worker.ts`.
- The collector uses a single multiplexed SSH channel per host (`BUNDLE_CMD`) — never 14 parallel `exec()` calls — keeping sessions well under sshd `MaxSessions=10`.
- SSH concurrency across the fleet is capped at `COLLECTOR_MAX_PARALLEL_SSH` (default 8, hard max 16) per worker job.
- Worker-level scan concurrency is capped dynamically by RAM: `floor((total_ram_MB − 256) / 60)`, bounded by `WORKER_CONCURRENCY` env override and a hard cap of 32.

### Async / Queue

- Queue names, retry policies, and retention counts are defined **only** in `src/lib/server/queue/config.ts`.
- All long-running or externally-dependent work (SSH, DO API, Spaces I/O) goes through a BullMQ queue — never executed synchronously on the web process.
- Workers handle `SIGTERM`/`SIGINT` gracefully: they stop accepting new jobs and drain in-flight work before exiting. A 25 s forced-exit guard ensures DO App Platform SIGKILL windows are respected.
- Job retry/backoff policies per type:
  - `scan` (scan-worker): 3 attempts, exponential 2 s backoff.
  - `sandboxProvision` (sandbox-worker): 5 attempts, exponential 5 s backoff.
  - `sandboxSeed` (sandbox-worker): 3 attempts, exponential 10 s backoff.
  - `sandboxCleanup` (sandbox-worker): 10 attempts, exponential 30 s backoff (orphaned Droplets are expensive).
  - `webhook` (ops-worker): 6 attempts, exponential 5 s backoff; failed jobs land in the queue's failed set as the operational DLQ.
  - `export` (ops-worker): 3 attempts, exponential 30 s backoff.
  - `maintenance` (ops-worker): single-attempt repeating jobs (cron-style).

### Secrets / Credentials

- SSH private keys and long-lived credentials **must** flow through the secrets provider (`SECRET_PROVIDER=env|doppler|infisical|db`).
- Keys stored via the `db` provider are envelope-encrypted at rest (per-tenant DEK + external KMS — see `src/lib/server/secrets/envelope.ts`).
- Non-customer secrets (Stripe public key, `NEXT_PUBLIC_*`) may live in plain env vars. SSH keys, API tokens, and database credentials must not.

### Public / Demo surface

- `src/app/(marketing)/demo/*` is **seeded fictional data** (`src/lib/demo/`) — no real tenant data, no scan side effects.
- `src/app/(marketing)/demo/sandbox` is a **static walkthrough** of the eight drift scenarios; the live ephemeral-Droplet showcase that previously powered this page was retired (see `docs/runbooks/operations.md` § 4b).
- `src/app/(marketing)/demo/showcase` permanently redirects to `/demo/sandbox`.
- `src/app/api/public/**` endpoints (egress IPs, demo evidence) are rate-limited by IP (sliding window, Redis-backed when available). When the showcase is re-enabled, `/api/public/sandbox-showcase` exposes only the showcase tenant's data; with `SHOWCASE_AUTO_PROVISION_DISABLED=true` it short-circuits to `{status: "retired"}`.
- No real customer org data is ever accessible via public routes.

### Outbound Webhooks

- All event deliveries to external SIEM/webhook endpoints go through `outbound-webhook.ts`.
- Direct `fetch()` calls to arbitrary customer-controlled URLs from route handlers are prohibited.

### Charon (cloud janitor)

- Linked-account credentials are stored envelope-encrypted (`janitor_accounts`); scans run on the **`blackglass-janitor`** BullMQ queue (`src/lib/server/queue/janitor-queue.ts`), not on the web request thread.
- Scheduled Charon ticks are repeatable jobs on the **maintenance** queue (`charon-scheduled-scans` in `maintenance-queue.ts`).
- Tenant isolation uses the same RLS pattern as other `janitor_*` tables; see migrations `0019`–`0025` under `drizzle/`.
- Optional `charon.scan.completed` webhooks reuse `dispatchTenantJsonWebhooks` + HMAC headers (`charon-scan-webhook.ts`).

---

## 4. Plan-Enforced Limits

Limits are defined in `src/lib/saas/plans.ts` and enforced in two places:

| Limit | Hard enforcement | Soft prompt |
|-------|-----------------|-------------|
| Hosts per plan | `src/lib/server/services/scan-drift-job.ts` (pre-scan check) | `SaasTrialBanner`, `UpgradePrompt` |
| Evidence bundles | `src/lib/server/evidence-bundle-quota.ts` | `UpgradePrompt` |
| Retention window | Query filter in `drift-history-pg.ts` | Plan page |
| Seats | `src/lib/saas/seats.ts` | Invite flow |

---

## 5. Storage Backend Matrix

| Environment | Baseline | Drift history | Drift events | Evidence |
|-------------|----------|---------------|--------------|----------|
| Local dev   | FS / Memory | FS / Memory | Memory | FS / none |
| Staging     | Postgres + Spaces | Postgres | Postgres (partitioned) | Spaces |
| Production  | Postgres + Spaces | Postgres | Postgres (partitioned) | Spaces |

Backends are selected automatically by `src/lib/server/store/index.ts` based on which env vars are present. `STORAGE_BACKEND` can be used to force a specific adapter.

---

## 6. Queue Observability

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Uptime check (public → shallow; authenticated → full config) |
| `GET /api/health?probe=secrets` | Secrets backend reachability |
| `GET /api/health?probe=redis` | Rate-limit / queue Redis reachability |
| `GET /api/health?probe=spaces` | DigitalOcean Spaces reachability |
| `GET /api/admin/queues` | BullMQ queue health: waiting/active/delayed/failed counts |
| `GET /api/admin/rate-limits` | Per-key rate-limit hit counts |

---

## 7. Adding a New Feature — Checklist

1. **New DB table**: add `tenant_id`, RLS policy (model after the `_v2` policies in `drizzle/0016_consolidate_rls_gucs.sql`), Drizzle migration.
2. **New API route**: use `requireSaasOrLegacyPermission()` for authenticated routes; use `checkDemoCtaRate()` or equivalent for public routes.
3. **New long-running task**: add a job type to the appropriate queue, define retry policy in `queue/config.ts`, handle in the relevant worker.
4. **New secret/credential type**: route through `secrets/factory.ts`; never store plain-text in DB.
5. **New public-facing route**: add IP rate limiting; ensure no tenant data leaks.
