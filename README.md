# BLACKGLASS

[![CI — main](https://github.com/thevenomv/blackglass-console/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/thevenomv/blackglass-console/actions/workflows/ci.yml)

Next.js fleet console for baselines, drift, evidence exports, Stripe billing hooks, and DigitalOcean-ready deployment.

## Requirements

- **Node.js** `22.x` (`>=22 <23`; see [.nvmrc](.nvmrc))
- **npm** `>=10`

## Quick start

```bash
npm ci
cp .env.example .env.local   # Linux/macOS — on Windows copy manually
npm run dev
```

Optional: `npm run dev:doppler` via [Doppler](https://docs.doppler.com/), or PowerShell helper `scripts/doppler-dev.ps1`.

## NPM scripts

| Script | Purpose |
|--------|---------|
| `dev` | Local Next.js dev server |
| `build` / `start` | Production bundle; `start` assumes prior `next build` with standalone output (`next.config.ts`) |
| `lint` | ESLint CLI (`eslint.config.mjs`) |
| `typecheck` | `tsc --noEmit` |
| `test:unit` | Vitest |
| `test:e2e` | Playwright (needs dev server via config) |
| `check:openapi` | OpenAPI ↔ `route.ts` parity |
| `schemas:export` | Regenerate `openapi/zod-schemas.json` from Zod |
| `verify:stage0` | CI-shaped gate (lint + OpenAPI + schema diff + **typecheck** + unit + build — no Playwright) |
| `verify:staging` | Hit `STAGING_URL` health/hosts audit (`VERIFY_SECRETS_PROBE=1` optional) |
| `audit:export-spaces` | List/download Spaces `audit/*.jsonl` (needs `DO_SPACES_*`; see [docs/audit-trail.md](docs/audit-trail.md)) |
| `audit:verify-jsonl` | Deterministic NDJSON integrity digest (`stdin` or file argument) |
| `load:rate-local` | Burst `POST /api/v1/scans` until HTTP 429 (local dev; `BASE_URL`, `BURST_LIMIT`) |
| `doppler:verify` | Doppler secrets download smoke test |
| `stripe:setup` | Interactive Stripe webhook/price bootstrap ([script](scripts/stripe-setup.mjs)) |
| `do:apply-stage0` | Applies Stage-0 auth env on an existing DO app |

**DigitalOcean App Platform:** deploy builds use `npm ci` and `next build` only; rely on this repo’s GitHub Actions for `lint`. ESLint on DO builders is a common source of flaky or persistent failures if you add it to `build_command` — see [.do/README.md](.do/README.md#eslint-and-app-platform).

## Maintenance & upgrades

- **Dependabot:** Weekly npm PRs — triage on GitHub (merge or close with rationale); **`npm audit --audit-level=high --omit=dev`** runs on every CI push. Moderate **`postcss`** advisories via **`next/node_modules`** may persist until **Next** ships patched deps — avoid **`npm audit fix --force`**. DevDependency **`postcss`** stays on **^8.5.x** for direct toolchain use.
- **Lint:** **`eslint .`** + **`eslint.config.mjs`** (Next **`core-web-vitals`** via FlatCompat); `next lint` is not used.
- **`verify:stage0`:** Run before pushing substantive changes — same gates as CI (lint, OpenAPI, Zod schema diff, typecheck, unit tests, production build).

## Shipping

- **`git push` → GitHub Actions** on `main` / `staging` / PRs runs audit, lint, typecheck, OpenAPI, unit tests, **`next build`** (TypeScript enforced), **`test:e2e`** and **`test:e2e:live`** (SSR with `NEXT_PUBLIC_USE_MOCK=false`).
- **Sentry releases:** CI sets `SENTRY_RELEASE` and `NEXT_PUBLIC_SENTRY_RELEASE` to the git SHA during build when present; mirror that in Doppler for production (`SENTRY_RELEASE`, optional `NEXT_PUBLIC_SENTRY_RELEASE`).

## Stripe (go-live sanity)

Use **`npm run stripe:setup`** for dashboard objects and webhook scaffolding. Detailed live vs test steps: **[docs/stripe-live-cutover.md](docs/stripe-live-cutover.md)**. Extended live soak checklist: **[docs/stripe-live-soak.md](docs/stripe-live-soak.md)**. Before accepting paid traffic: **`STRIPE_SECRET_KEY`** (restricted live), **`STRIPE_WEBHOOK_SECRET`**, **`STRIPE_PRO_PRICE_ID`**, **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`**, then confirm webhook → plan persistence — see [.env.example](.env.example) and [docs/staging-deployment-checklist.md](docs/staging-deployment-checklist.md).

## Operators

- Deploy specs: [.do/](.do/) (see [.do/README.md](.do/README.md))
- Runbooks: [docs/operator-guide.md](docs/operator-guide.md), [docs/staging-deployment-checklist.md](docs/staging-deployment-checklist.md)
- Local Windows / OneDrive builds: [docs/troubleshooting-local-build.md](docs/troubleshooting-local-build.md)
- First GitHub Actions runs (`gh workflow run`): [docs/github-actions-first-run.md](docs/github-actions-first-run.md)
- Staging probe: [.github/workflows/staging-smoke.yml](.github/workflows/staging-smoke.yml) (secret **`STAGING_URL`** and/or **`staging_url_override`**; weekly cron when secret present)
- ZAP passive DAST: [.github/workflows/dast-zap-baseline.yml](.github/workflows/dast-zap-baseline.yml) (optional **`target_url_override`**; **`fail_action`** off — review logs / ZAP report manually); rule tuning: [docs/zap-baseline-rules.md](docs/zap-baseline-rules.md)
- Security / pen checklist: [docs/security-pentest-checklist.md](docs/security-pentest-checklist.md)
- Access review cadence: [docs/access-review-playbook.md](docs/access-review-playbook.md)
- Audit trail: [docs/audit-trail.md](docs/audit-trail.md) · PostgreSQL appendix: [docs/audit-postgresql-adrs.md](docs/audit-postgresql-adrs.md)
- Scaling: collectors [docs/collector-fleet-scaling.md](docs/collector-fleet-scaling.md) · Distributed rate-limit ADR: [docs/rate-limit-redis-adrs.md](docs/rate-limit-redis-adrs.md)
- Tenancy outline: [docs/multi-tenant-outline.md](docs/multi-tenant-outline.md) · Incident hooks: [docs/incident-notification.md](docs/incident-notification.md)
- Next.js bumps: [docs/nextjs-16-upgrade.md](docs/nextjs-16-upgrade.md) — branch **`release/next-16`** tracks preparatory merges.
- Architecture spine: [docs/architecture-flow.md](docs/architecture-flow.md)

## Project map

Tracked layout and rationale: [PROJECT_FILES.md](PROJECT_FILES.md)

## Responsible disclosure

If you discover a security issue: open a **private** advisory with repo maintainers; do not file public tickets with exploit details until coordinated.
