# Architecture Decisions

Record of key architectural choices, their rationale, and invariants that must be preserved as the codebase evolves.

---

## 1. Web vs Worker separation

| | Detail |
|---|---|
| **Decision** | Next.js `web` component and three BullMQ workers (`scan-worker`, `ops-worker`, `sandbox-worker`) run as separate App Platform processes. |
| **Rationale** | SSH handshakes and cryptographic operations are CPU-bound. Running them in the web tier would starve the V8 event loop and cause API + dashboard latency. Workers can be scaled independently (more replicas / more CPU) without touching the web tier. |
| **Queues (active)** | `blackglass-scans` (scan-worker), `blackglass-sandbox` (sandbox-worker), `blackglass-webhooks`, `blackglass-exports`, `blackglass-maintenance` (ops-worker). |
| **Queues (reserved, no worker yet)** | `blackglass-reports`, `blackglass-evidence` — names defined in `queue/config.ts` for future async generation. PDF / evidence generation currently runs inline in the API handler. |
| **Invariant** | Every scan job **must** be idempotent. The worker loads credentials fresh per-job; never reuse SSH keys across jobs or cache them in memory between runs. |
| **Scaling rule** | Scale worker replicas or `WORKER_CONCURRENCY` for scan throughput. Scale web replicas for HTTP concurrency. Scale Redis vertically. |

---

## 2. SSH collection — single-channel bundled script

| | Detail |
|---|---|
| **Decision** | All 14 collection checks are sent as a single shell script over one SSH channel, rather than 14 parallel `exec()` channels. |
| **Rationale** | OpenSSH's default `MaxSessions` is **10**. Opening 14 simultaneous channels per host would breach this on stock configurations and produce false-positive "unreachable" failures on Enterprise fleets. A single channel also reduces TCP/crypto overhead by ~90% at scale. |
| **Output format** | Each check section is delimited by a `=BGS:<key>` marker line. `parseBundleOutput()` in `ssh.ts` splits the combined output into named strings fed into the existing parser functions unchanged. |
| **Timeouts** | `timeout 10` wraps `systemctl` (can be slow on loaded hosts); `timeout 20` wraps `find` (SUID scan). The overall `AbortController` fires after `COLLECTION_TIMEOUT_MS` (default: 75 s, env-overridable) and destroys the SSH connection if the script hangs. |
| **Invariant** | Parsers (`parsers.ts`) receive the same string content as before — the bundling is transparent to the drift engine. Never change the section keys without updating both `BUNDLE_CMD` and the `resolve({...})` call in `runCollection()`. |

---

## 3. Multi-tenant Postgres + RLS

| | Detail |
|---|---|
| **Decision** | Single shared Postgres cluster with Row-Level Security policies. Clerk org ID is the tenant boundary. |
| **Rationale** | Cost-effective at current scale. RLS enforces isolation at the DB layer independently of application code, giving defence-in-depth. |
| **Role invariant** | The application role (`DB_USER`) must **not** be the table owner and must not have `BYPASSRLS`. Migrations run as a separate privileged role. |
| **Context pattern** | All queries must run within a transaction that sets `app.tenant_id` (the GUC the application code reads, via `withTenantRls()` in `src/db/index.ts`) to the authenticated Clerk org ID before RLS predicates are evaluated. Never pass tenant IDs as query parameters alone. Migration `drizzle/0016_consolidate_rls_gucs.sql` consolidated the historical `app.current_tenant` / `app.current_tenant_id` GUCs onto the canonical `(app.tenant_id, app.bypass_rls)` pair on every shipped policy. |
| **Evolution path** | "Soft isolation" → stricter per-tenant rate limiting + resource quotas (current). "Harder isolation" → separate schema or dedicated DB cluster per Enterprise customer (future, no code rewrite required if context-setting is consistent). |

---

## 4. Redis / BullMQ as async spine

| | Detail |
|---|---|
| **Decision** | BullMQ over Redis is the sole mechanism for background work when `REDIS_QUEUE_URL` is set. The web tier falls back to in-process execution when Redis is absent (Stage 0/1). |
| **Key invariants** | Jobs are idempotent; safe to retry. `attempts: 3`, exponential backoff (2 s → 4 s → 8 s). Stalled-job requeue: 30 s interval, max 2 requeues. Dead-letter: after 3 failures the job moves to BullMQ's failed set. |
| **Queue SLO** | Target: scan result visible in UI within 90 s of trigger under normal load (single host). Exceeding 180 s is a degradation signal warranting worker scaling. |
| **Observability** | `QueueEvents` listener in `scan-worker.ts` emits `logStructured` events for `waiting`, `active`, `failed`. `worker.on("completed")` logs queue depth snapshot after every job. |
| **Graceful shutdown** | On `SIGTERM`/`SIGINT`, `worker.close()` drains active jobs (stops accepting new work). A 25 s forced-exit guard ensures the process exits within DO App Platform's 30 s SIGTERM window. Jobs that do not complete in time are requeued by BullMQ's stalled-job detection. |

---

## 5. App Platform deployment model

| | Detail |
|---|---|
| **Decision** | DigitalOcean App Platform (git-source deploy, `lon` region). Separate `web` and `worker` components in the same app spec. |
| **Scaling rules** | Web: horizontal (add replicas for HTTP concurrency). Worker: horizontal (add replicas × `WORKER_CONCURRENCY` for scan throughput). Postgres: vertical (managed DO DB, resize instance). Redis: vertical (managed DO Redis, resize). |
| **Rolling deploys** | App Platform performs rolling updates. Readiness is determined by the HTTP health check on `/api/health` (web) or process startup (worker). The worker's graceful shutdown ensures in-flight scans complete before the old instance is replaced. |
| **Environments** | `staging` and `production` run as separate App Platform apps with independently tuned resources. Never copy production resource sizing blindly to staging. |
| **Static egress** | Egress IPs are exposed at `GET /api/public/egress-ips` for customer firewall automation. Routing worker egress through a reserved Floating IP / NAT gateway is the next step for fully stable allowlisting. |

---

## 6. Secret management

| | Detail |
|---|---|
| **Decision** | Pluggable `SecretProvider` interface: `env` (default/local), `doppler`, `infisical`, `vault`, `db` (Postgres-backed with envelope encryption). Selected via `SECRET_PROVIDER` env var. |
| **Current state** | SSH private keys are fetched JIT per scan from the configured provider. Keys are never cached to disk or reused across jobs. |
| **Envelope encryption (shipped)** | When `SECRET_PROVIDER=db`, SSH keys stored in Postgres are encrypted with a per-tenant DEK, itself wrapped by a KMS-managed KEK. KMS provider is selected by `KMS_PROVIDER` (`local` / `vault` / `awskms`). Even a full DB dump would not expose keys without the KMS. See `src/lib/server/secrets/envelope.ts` and `src/lib/server/secrets/README.md`. |

---

## 7. Data retention

| | Detail |
|---|---|
| **Drift events** | Postgres-backed in SaaS mode (`drift_events`, monthly date-range partitioned so expired partitions can be dropped atomically without locking). Legacy in-memory and filesystem stores remain for Stage-0 / dev. Selected automatically by `src/lib/server/store/index.ts`. |
| **Baselines / reports / evidence** | Stored in DigitalOcean Spaces with tenant-scoped key prefixes (`{tenantId}/baselines/`, `{tenantId}/reports/`, `{tenantId}/evidence/`). Spaces lifecycle rules transition cold artefacts and delete after the contractual retention window. See `scripts/do/configure-spaces-lifecycle.mjs`. |
