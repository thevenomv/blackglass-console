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
- **Server** runs `captureBaselinesFromFleet()` → `collectAllSnapshots()` (SSH). SSH material is fetched **just-in-time** via `SECRET_PROVIDER` (`env` / Doppler / Infisical / Vault) — see `src/lib/server/secrets/README.md`. Multi-host runs use bounded parallel SSH (`COLLECTOR_MAX_PARALLEL_SSH`); optional JSON logs: `collector.*` / `BLACKGLASS_LOG_COLLECTOR`.
- **Persistence:** `BASELINE_STORE_PATH` optional JSON file; otherwise in-memory Map.
- **Cache:** `revalidateIntegritySurfaces()` invalidates `/`, `/hosts`, `/drift` so SSR picks up inventory.

## 2. Scan execution

- **Client** posts `POST /api/v1/scans` with optional `host_ids` (must be a subset of configured `host-*` ids when the collector is configured).
- **Rate limit** applies per client IP.
- **Job** is queued immediately (`202`); when the collector is configured, `executeDriftScanJob()` runs in the background: `collectAllSnapshots`, `getBaseline`, `computeDrift`, `storeDriftEvents`, `recordDriftScanDayStamp` (optional `DRIFT_HISTORY_PATH` file).
- **Polling:** `GET /api/v1/scans/:id` validates the id path segment, then returns `projectScanJob` until terminal.

## 3. Drift computation

- `computeDrift(baseline, current)` in `drift-engine.ts` emits typed `DriftEvent` records (network, identity, persistence, ssh, firewall, …).
- **Reads:** `GET /api/v1/drift` validates `hostId` / `lifecycle` query params with **Zod**; `GET /api/v1/audit/events` validates `limit` (1–200).

## 4. Dashboard & inventory

- `loadFleetSnapshot` / `loadHosts` drive KPIs and host rows when `collectorConfigured`; otherwise mock fixtures.
- **Fleet chart:** last scans contribute to `drift-history` buckets → `getDriftVolumeChartFromHistory()`.

## 5. Evidence & audit

- **Auth (App Router):** login lives under `(auth)/login` (URL remains `/login`); settings sign-out imports `@/app/(auth)/login/actions`.
- **Evidence bundle** paths (`/evidence/bundles/:id` and `/file`) use the same `ResourceIdPathSchema` guard as other id routes.
- **Evidence bundle** metadata is served from `evidence-catalog.ts`; KPI **Evidence bundles** count matches catalog size in live fleet mode.
- **Audit** events append via `POST /api/v1/audit/events` (validated body).

## 6. Health & observability

- `GET /api/health` returns **runtime configuration only** by default (`diagnostics_scope: runtime_configuration`). The `collector` block reflects env/slots/`SECRET_PROVIDER` readiness — **it does not fetch SSH material**.
- With `?probe=secrets`, scope becomes **`runtime_configuration+secret_backend_reachability`** and **`secrets_probe`** runs (rate-limited per IP).
- **`baseline_store`:** `{ path, writable } | null`.

## 7. Operational persistence

App Platform / Docker filesystems are **ephemeral**. For production, mount **persistent volumes** (or external DB/object storage) at:

- `BASELINE_STORE_PATH`
- `DRIFT_HISTORY_PATH` (optional)

## Future boundary

If scan orchestration or SSH load grows, `src/lib/server` modules can move behind a worker service; **OpenAPI** + **Zod** keep the HTTP edge stable while the worker evolves.
