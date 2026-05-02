# BLACKGLASS

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
| `lint` | `next lint` |
| `typecheck` | `tsc --noEmit` |
| `test:unit` | Vitest |
| `test:e2e` | Playwright (needs dev server via config) |
| `check:openapi` | OpenAPI ↔ `route.ts` parity |
| `schemas:export` | Regenerate `openapi/zod-schemas.json` from Zod |
| `verify:stage0` | CI-shaped gate (lint + OpenAPI + schema drift + unit + build) |
| `verify:staging` | Hit `STAGING_URL` health/hosts audit (`VERIFY_SECRETS_PROBE=1` optional) |
| `doppler:verify` | Doppler secrets download smoke test |
| `stripe:setup` | Interactive Stripe webhook/price bootstrap ([script](scripts/stripe-setup.mjs)) |
| `do:apply-stage0` | Applies Stage-0 auth env on an existing DO app |

**DigitalOcean App Platform:** deploy builds use `npm ci` and `next build` only; rely on this repo’s GitHub Actions for `lint`. ESLint on DO builders is a common source of flaky or persistent failures if you add it to `build_command` — see [.do/README.md](.do/README.md#eslint-and-app-platform).

## Operators

- Deploy specs: [.do/](.do/) (see [.do/README.md](.do/README.md))
- Runbooks: [docs/operator-guide.md](docs/operator-guide.md), [docs/staging-deployment-checklist.md](docs/staging-deployment-checklist.md)
- Architecture spine: [docs/architecture-flow.md](docs/architecture-flow.md)

## Project map

Tracked layout and rationale: [PROJECT_FILES.md](PROJECT_FILES.md)

## Responsible disclosure

If you discover a security issue: open a **private** advisory with repo maintainers; do not file public tickets with exploit details until coordinated.
