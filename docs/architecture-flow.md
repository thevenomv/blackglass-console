# BLACKGLASS architecture — integrity loop

## Product spine (operator view)

End-to-end flow the codebase is built around:

1. **Baseline** — Capture known-good host state (`POST /api/v1/baselines` or Baselines UI).
2. **Scan** — Re-collect live state (`POST /api/v1/scans`); job completes asynchronously (`GET /api/v1/scans/:id`).
3. **Drift** — Engine compares baseline vs current; events stored per host (`GET /api/v1/drift`).
4. **Investigate** — Operators triage in **Drift** UI (lifecycle, audit posts).
5. **Export** — Evidence bundles / reports surfaces (catalog + future SIEM hooks).

API transport stays thin: **Zod** validates requests; domain work lives under `src/lib/server/` (including **`services/`** for orchestration helpers used by route handlers).

---

## 1. Baseline capture

- **Operator** calls `POST /api/v1/baselines` or uses the Baselines UI.
- **Server** runs `captureBaselinesFromFleet()` → `collectAllSnapshots()` (SSH). SSH material is fetched **just-in-time** via `SECRET_PROVIDER` (`env` / Doppler / Infisical / Vault / `db` with envelope encryption) — see `src/lib/server/secrets/README.md`. Multi-host runs use bounded parallel SSH (`COLLECTOR_MAX_PARALLEL_SSH`); optional JSON logs: `collector.*` / `BLACKGLASS_LOG_COLLECTOR`.
- **Persistence:** SaaS deploys persist to **Postgres + DigitalOcean Spaces** (selected automatically by `src/lib/server/store/index.ts`); legacy/dev path uses `BASELINE_STORE_PATH` (JSON file) or in-memory Map.
- **Cache:** `revalidateIntegritySurfaces()` invalidates `/`, `/hosts`, `/drift` so SSR picks up inventory.

## 2. Scan execution

- **Client** posts `POST /api/v1/scans` with optional `host_ids` (must be a subset of configured `host-*` ids when the collector is configured).
- **Rate limit** applies per client IP (24 / 60 s — see `docs/http-rate-limit-budgets.md`).
- **Job** is enqueued onto `blackglass-scans` (BullMQ over Redis) when `REDIS_QUEUE_URL` is set; the `scan-worker` consumer drains it. The web tier returns `202` immediately. Without Redis (Stage-0 / dev), `executeDriftScanJob()` runs in-process.
- **Pipeline:** `collectAllSnapshots`, `getBaseline`, `computeDrift`, `storeDriftEvents` (Postgres `drift_events`, partitioned monthly), `recordDriftScanDayStamp` (Postgres in SaaS, optional `DRIFT_HISTORY_PATH` file in dev).
- **Polling:** `GET /api/v1/scans/:id` validates the id path segment, then returns `projectScanJob` until terminal.

## 3. Drift computation

- `computeDrift(baseline, current)` in `drift-engine.ts` emits typed `DriftEvent` records (network, identity, persistence, ssh, firewall, …).
- **Reads:** `GET /api/v1/drift` validates `hostId` / `lifecycle` query params with **Zod**; `GET /api/v1/audit/events` validates `limit` (1–200).

## 4. Dashboard & inventory

- `loadFleetSnapshot` / `loadHosts` drive KPIs and host rows when `collectorConfigured`; otherwise mock fixtures.
- **Fleet chart:** last scans contribute to `drift-history` buckets → `getDriftVolumeChartFromHistory()`.

## 5. Evidence & audit

- **Auth:** SaaS path uses **Clerk** (`/sign-in`, `/sign-up`, org context); legacy single-tenant login lives under `(auth)/login` (URL remains `/login`). Choice is automatic based on `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- **Evidence bundle** paths (`/evidence/bundles/:id` and `/file`) use the same `ResourceIdPathSchema` guard as other id routes.
- **Evidence bundle** metadata is served from `evidence-catalog.ts`; KPI **Evidence bundles** count matches catalog size in live fleet mode.
- **Audit (SaaS):** every privileged action emits a `saas_audit_events` row via `emitSaasAudit()`. Legacy `appendAudit()` path remains for non-SaaS / Stage-0 deployments.

## 6. Health & observability

- `GET /api/health` returns **runtime configuration only** by default (`diagnostics_scope: runtime_configuration`). The `collector` block reflects env/slots/`SECRET_PROVIDER` readiness — **it does not fetch SSH material**.
- With `?probe=secrets`, scope becomes **`runtime_configuration+secret_backend_reachability`** and **`secrets_probe`** runs (rate-limited per IP).
- **`baseline_store`:** `{ path, writable } | null`.

## 7. Operational persistence

App Platform / Docker filesystems are **ephemeral**. The SaaS production
path persists everything externally:

- **Drift events:** `drift_events` (Postgres, partitioned monthly).
- **Baselines + drift history:** Postgres + DO Spaces (selected
  automatically when `DATABASE_URL` and `DO_SPACES_*` are set).
- **Evidence bundles:** DO Spaces (`evidence/<tenant>/<bundle-id>.zip`),
  with bucket versioning + lifecycle.
- **Audit:** `saas_audit_events` (Postgres) with deterministic JSONL
  export.

For legacy / Stage-0 deployments, mount persistent volumes at
`BASELINE_STORE_PATH` (and optionally `DRIFT_HISTORY_PATH`).

## Process boundaries

The scan / drift pipeline runs in **`scan-worker`** (separate process)
when `REDIS_QUEUE_URL` is set; the web tier never blocks on SSH or drift
compute in production. **`ops-worker`** drains webhooks, exports, and
maintenance crons. **`sandbox-worker`** drives the remediator's
verification path. OpenAPI + Zod keep the HTTP edge stable while
worker code evolves.
