# BLACKGLASS — project file map (for review)

Single reference of **every tracked-ish source file** (excluding `node_modules/`, `.next/`, `.git/`). Generated artifacts such as `test-results/`, `tsconfig.tsbuildinfo` are noted but not enumerated.

---

## Root


| File                                 | Role                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` / `package-lock.json` | Dependencies, scripts (`dev`, `build`, `verify:stage0`, `do:apply-stage0`, `verify:staging`, `lint`, `check:openapi`, `test:e2e`, `test:e2e:live`)        |
| `tsconfig.json`                      | TypeScript project                                                                                                                                        |
| `next.config.ts`                     | Next.js configuration                                                                                                                                     |
| `next-env.d.ts`                      | Next-generated types                                                                                                                                      |
| `middleware.ts`                      | Edge middleware (e.g. auth gating)                                                                                                                        |
| `tailwind.config.ts`                 | Tailwind theme / content paths                                                                                                                            |
| `postcss.config.mjs`                 | PostCSS pipeline                                                                                                                                          |
| `Dockerfile`                         | Container image                                                                                                                                           |
| `.dockerignore`                      | Docker build context                                                                                                                                      |
| `.env.example`                       | Documented env vars (API, collector, `BASELINE_STORE_PATH`, `DRIFT_HISTORY_PATH`)                                                                         |
| `.eslintrc.json`                     | ESLint                                                                                                                                                    |
| `.gitignore`                         | Git ignore rules                                                                                                                                          |
| `.nvmrc`                             | Node version pin                                                                                                                                          |
| `playwright.config.ts`               | E2E dev server on port `**3100`** by default (`PLAYWRIGHT_PORT` override); `PLAYWRIGHT_LIVE=1` → `NEXT_PUBLIC_USE_MOCK=false` for optional live-SSR tests |


---

## `.do/` — DigitalOcean App Platform


| File                                                                              | Role                       |
| --------------------------------------------------------------------------------- | -------------------------- |
| `app.yaml`, `app-current.yaml`, `app-git.production.yaml`, `app-git.staging.yaml` | Deployment specs           |
| `app-create.phase1.json`                                                          | Bootstrap metadata         |
| Other `.ps1` / helpers                                                            | Referenced from `scripts/` |


---

## `.github/workflows/`


| File                | Role                            |
| ------------------- | ------------------------------- |
| `ci.yml`            | Lint, schemas, unit tests, build |
| `staging-smoke.yml` | Optional staging verification   |
| `uptime.yml`        | Scheduled health checks         |


---

## `docs/`


| File                              | Role                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `operator-guide.md`               | Runbook                                                                                       |
| `architecture-flow.md`            | **Five-step product spine**; baseline → scan → drift → investigate → export; health semantics |
| `doppler-digitalocean-setup.md`   | Doppler + DO App Platform                                                                     |
| `staging-deployment-checklist.md` | Pre-external pilot deploy gates                                                               |
| `do-list.md`                      | Post-deploy / DO follow-up checklist (Stage 0+)                                               |
| `saas-customer-roadmap.md`        | Stages 0–4: internal → multi-tenant → enterprise                                              |


---

## `openapi/`


| File               | Role                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `blackglass.yaml`  | API contract                                                                                               |
| `zod-schemas.json` | JSON Schema export of `**http/schemas.ts`** (`npm run schemas:export`) — CI checks drift vs committed file |


---

## `public/`


| File       | Role                          |
| ---------- | ----------------------------- |
| `.gitkeep` | Placeholder for static assets |


---

## `scripts/`


| File                                             | Role                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `check-openapi-paths.mjs`                        | Verifies OpenAPI paths + `src/app/api/v1/**/route.ts` presence                   |
| `export-zod-schemas.ts`                          | `**npm run schemas:export**` → `openapi/zod-schemas.json`                        |
| `doppler-verify.mjs`                             | Doppler download API smoke (no PEM printed)                                      |
| `doppler-dev.ps1`                                | PATH refresh + `**npm run dev:doppler**`                                         |
| `run-do-apply-stage0.mjs`                        | npm launcher for `do_apply_stage0.py` (tries `py -3`, `python3`, `python`)       |
| `verify-staging.mjs`                             | `**STAGING_URL**` health / hosts / audit (optional `**VERIFY_SECRETS_PROBE=1**`) |
| `do_apply_stage0.py`                             | DO API: set `**AUTH_REQUIRED=true**` + `**AUTH_SESSION_SECRET**` on existing app |
| `do_bootstrap_blackglass.py`                     | DO bootstrap                                                                     |
| `do-docker-push.ps1` / `do-prepare-app-spec.ps1` | Deployment helpers                                                               |


---

## `src/app/` — App Router


| Path                                               | Role                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `layout.tsx`                                       | Root layout, fonts, providers                                    |
| `globals.css`                                      | Global CSS variables / base                                      |
| `error.tsx`                                        | App error boundary                                               |
| `page.tsx`                                         | Home / fleet dashboard (fleet data + drift-derived cards)        |
| `(auth)/login/page.tsx`, `(auth)/login/actions.ts` | Login UI and server actions (route group — URL remains `/login`) |
| `baselines/page.tsx`                               | Baselines diff UI                                                |
| `drift/page.tsx`                                   | Drift triage (mock vs live branch)                               |
| `drift/error.tsx`                                  | Segment error boundary (drift queue failures)                    |
| `hosts/page.tsx`                                   | Host list                                                        |
| `hosts/[id]/page.tsx`                              | Host detail                                                      |
| `hosts/[id]/error.tsx`                             | Segment error boundary (single host load failures)               |
| `evidence/page.tsx`                                | Evidence workspace                                               |
| `reports/page.tsx`                                 | Reports                                                          |
| `settings/page.tsx`                                | Settings                                                         |
| `workspace/page.tsx`                               | Incident workspace                                               |
| `onboarding/page.tsx`                              | Onboarding flow                                                  |
| `demo/page.tsx`                                    | Partner demo script                                              |


### `src/app/api/`


| Path                   | Role                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `api/health/route.ts`  | Liveness; `**diagnostics_scope**` (`runtime_configuration` or `+secret_backend_reachability`); optional `**?probe=secrets**` |
| `api/session/route.ts` | Session / guest role                                                                                                         |


### `src/app/api/v1/`


| Path                                  | Role                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `audit/events/route.ts`               | Audit log GET/POST (stub)                                                   |
| `baselines/route.ts`                  | Thin handler → `**captureBaselinesFromFleet()**`; GET list summaries        |
| `drift/route.ts`                      | Fleet drift list (`resolveDriftEventsForDashboard`)                         |
| `fleet/snapshot/route.ts`             | `loadFleetSnapshot()` JSON                                                  |
| `hosts/route.ts`                      | `loadHosts()` JSON                                                          |
| `scans/route.ts`                      | Thin handler → `**executeDriftScanJob()**`; enqueue + drift + history stamp |
| `scans/[id]/route.ts`                 | Scan job status                                                             |
| `evidence/bundles/[id]/route.ts`      | Bundle metadata (`evidence-catalog`)                                        |
| `evidence/bundles/[id]/file/route.ts` | Bundle download                                                             |


---

## `src/components/` — UI


| Path                                                                                | Role                                                                        |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `layout/AppShell.tsx`                                                               | App chrome shell                                                            |
| `layout/Sidebar.tsx`                                                                | Navigation                                                                  |
| `layout/PageHeader.tsx`                                                             | Page titles / breadcrumbs                                                   |
| `layout/MobileNavBar.tsx`                                                           | Mobile nav                                                                  |
| `dashboard/DashboardV3.tsx`                                                         | Fleet dashboard                                                             |
| `dashboard/RunScanButton.tsx`                                                       | Scan CTA                                                                    |
| `drift/DriftEventsView.tsx`                                                         | Drift table / filters                                                       |
| `drift/DriftInvestigationDrawer.tsx`                                                | Finding drawer                                                              |
| `hosts/HostsView.tsx`, `HostDetailView.tsx`                                         | Host list + detail                                                          |
| `baselines/BaselinesToolbar.tsx`                                                    | Baselines actions                                                           |
| `evidence/EvidenceView.tsx`, `EvidenceExportModal.tsx`                              | Evidence UI                                                                 |
| `reports/ReportsView.tsx`                                                           | Reports                                                                     |
| `scan/ScanJobBanner.tsx`                                                            | Scan progress                                                               |
| `workspace/WorkspaceConsole.tsx`                                                    | Workspace                                                                   |
| `onboarding/OnboardingFlow.tsx`                                                     | Onboarding                                                                  |
| `command/CommandPalette.tsx`                                                        | Command palette                                                             |
| `auth/SessionProvider.tsx`                                                          | Session + permission gates                                                  |
| `providers/Providers.tsx`, `ScanJobsProvider.tsx`                                   | Client providers                                                            |
| `theme/ThemeProvider.tsx`, `ThemeToggle.tsx`                                        | Theming                                                                     |
| `settings/OperatorHealthReadout.tsx`, `SettingsRotateRow.tsx`, `WebhookSection.tsx` | Settings sections                                                           |
| `ui/*`                                                                              | Primitives: `Badge`, `Button`, `Card`, `KpiCard`, `Skeleton`, `Toast`, etc. |


---

## `src/data/mock/` — Demo payloads & types


| File           | Role                                            |
| -------------- | ----------------------------------------------- |
| `types.ts`     | Shared domain types (hosts, drift, fleet, etc.) |
| `hosts.ts`     | Mock host list                                  |
| `fleet.ts`     | Mock fleet snapshot                             |
| `drift.ts`     | Mock drift events                               |
| `baselines.ts` | Mock baseline diff data                         |
| `reports.ts`   | Mock reports                                    |


---

## `src/lib/` — Shared client / isomorphic helpers


| Path                                        | Role                                          |
| ------------------------------------------- | --------------------------------------------- |
| `api/config.ts`                             | `NEXT_PUBLIC_*` flags                         |
| `api/fleet.ts`                              | `fetchFleetPageData` (mock / live SSR / HTTP) |
| `api/hosts.ts`                              | `fetchHosts`                                  |
| `api/origin.ts`                             | API base URL for SSR                          |
| `dashboard-shared.ts`                       | `LiveDashboardDriftCategory` type             |
| `auth/permissions.ts`, `session-signing.ts` | Roles / cookie signing                        |
| `hooks/useFocusTrap.ts`                     | Focus trap hook                               |
| `mockLatency.ts`                            | Simulated delay in mock mode                  |
| `resolveInvestigation.ts`                   | Investigation URL helpers                     |
| `severity.ts`                               | Severity normalization                        |


---

## `src/lib/server/` — Server-only


| File                           | Role                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `collector/index.ts`           | Barrel; same `@/lib/server/collector` import path                                                 |
| `collector/types.ts`           | `HostSnapshot`, `CollectScanOptions`, slice types                                                 |
| `collector/parsers.ts`         | `parseListeners`, `parseUsers`, … (unit-tested)                                                   |
| `collector/ssh.ts`             | SSH config build, `runCollection`, `allSshConfigs`                                                |
| `collector/gates.ts`           | `collectorConfigured`, `configuredHostCount`                                                      |
| `collector/collect.ts`         | `collectSnapshot`, `collectAllSnapshots`, fleet timeout + pooling                                 |
| `collector-env.ts`             | `**COLLECTOR_HOST_*` slot count**, `**collectorMaxParallelSsh`** (no `ssh2`)                      |
| `collector-runtime.ts`         | `**collectorRuntimeHealth()**` for `/api/health` (no secrets)                                     |
| `collector-events.ts`          | One-line JSON logs (`BLACKGLASS_LOG_COLLECTOR=0` to disable)                                      |
| `async-pool.ts`                | `**mapPool**` — bounded concurrency for fleet collection                                          |
| `secrets/README.md`            | Adapter table + how to add a `**SecretProvider**`                                                 |
| `secrets/*`                    | `**SecretProvider**`, Doppler / Infisical / **Vault SSH sign**, `probe`, `credential-to-ssh-auth` |
| `services/baseline-capture.ts` | `**captureBaselinesFromFleet()`** — baseline orchestration                                        |
| `services/scan-drift-job.ts`   | `**executeDriftScanJob()**` — post-enqueue drift pipeline                                         |
| `baseline-store.ts`            | Baseline map + file persistence + `**baselineStoreHealth()**`                                     |
| `drift-engine.ts`              | `computeDrift`, in-memory drift store                                                             |
| `drift-resolve.ts`             | `**resolveDriftEventsForDashboard**` (single mock/live rule)                                      |
| `drift-history.ts`             | `**DRIFT_HISTORY_PATH**` rolling counts + chart series                                            |
| `evidence-catalog.ts`          | Stub bundle catalog + count for KPI                                                               |
| `inventory.ts`                 | `loadHosts`, `loadFleetSnapshot`, real vs mock fleet                                              |
| `dashboard-context.ts`         | `**pickSpotlightHost**`, `**deriveDriftCardsFromEvents**`                                         |
| `http/json-error.ts`           | `**jsonError**`, `**zodErrorResponse**`, `**readJsonBodyOptional**`                               |
| `http/schemas.ts`              | Zod: **POST bodies** (scan, audit), **queries** (audit limit, drift filters), **path id** pattern |
| `integrity-revalidate.ts`      | `**revalidatePath`** for `/`, `/hosts`, `/drift` after baselines + scans                          |
| `scan-jobs.ts`                 | Async scan job state                                                                              |
| `rate-limit.ts`                | Scan POST rate limit                                                                              |
| `audit-log.ts`                 | Audit append                                                                                      |


---

## `tests/fixtures/`


| File                            | Role                                                   |
| ------------------------------- | ------------------------------------------------------ |
| `doppler-secrets-download.json` | Sample Doppler secrets-download shape for parser tests |
| `infisical-raw-secret-*.json`   | Sample Infisical raw secret API shapes                 |


---

## `tests/unit/`


| File                                                      | Role                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| `credential-and-vault.test.ts`                            | `**SshAuthConfig**` + mocked **Vault** sign                   |
| `secret-response-fixtures.test.ts`                        | Doppler / Infisical JSON body parsers vs `**tests/fixtures`** |
| `async-pool.test.ts`                                      | `**mapPool**` ordering + concurrency                          |
| `secrets-factory.test.ts`                                 | `**SECRET_PROVIDER**` / `credentialSourceConfigured`          |
| `doppler-secret-provider.test.ts`                         | Mocked Doppler JSON download                                  |
| `infisical-secret-provider.test.ts`                       | Mocked Universal Auth + raw secret                            |
| `collector-ssh.test.ts` / `collector-ssh-failure.test.ts` | Mocked **ssh2** success / connection error                    |
| `drift-engine.test.ts`                                    | `**computeDrift`** edge cases                                 |
| `collector-parsers.test.ts`                               | `**parseListeners**`, `**parseFirewall**`, etc.               |
| `http-schemas.test.ts`                                    | Query + path Zod schemas                                      |


---

## Root (testing)


| File               | Role                                   |
| ------------------ | -------------------------------------- |
| `vitest.config.ts` | Unit test runner (`npm run test:unit`) |


---

## `tests/e2e/`


| File               | Role                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| `smoke.spec.ts`    | Broad console smoke (includes `/api/health` + `baseline_store`)       |
| `live-ssr.spec.ts` | Optional `**PLAYWRIGHT_LIVE=1**` dashboard test with `USE_MOCK=false` |


---

## How it fits together

- **Collectors** write baselines and scans → **drift-engine** → **drift-history** (optional file) → **inventory** builds fleet KPIs + chart points.
- **Dashboard** uses **drift-resolve** so the same event source backs `/api/v1/drift` and the home page “top classes.”
- **OpenAPI** and **check-openapi-paths** guard documented surface area including `**/baselines`**.
- **API writes** use **Zod** (`http/schemas.ts`) where bodies exist; **Vitest** covers `**computeDrift`** and `**chartFromDayEntries**`.

---

*Last updated: SaaS staging docs + `verify-staging.mjs`; `src/lib/server/collector/` package.*