# BLACKGLASS

[![CI — main](https://github.com/thevenomv/blackglass-console/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/thevenomv/blackglass-console/actions/workflows/ci.yml)

Next.js **16** fleet console for baselines, drift, evidence exports, Stripe billing hooks, and DigitalOcean-ready deployment.

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
| `verify:stage0:clean` | **`clean:next`** then **`verify:stage0`** — helps Windows cloud-sync **`readlink`** failures |
| `clean:next` | Deletes **`.next/`** (`scripts/clean-next.mjs`) |
| `verify:staging` | Hit `STAGING_URL` health/hosts audit (`VERIFY_SECRETS_PROBE=1` optional) |
| `audit:export-spaces` | List/download Spaces `audit/*.jsonl` (needs `DO_SPACES_*`; see [docs/audit-trail.md](docs/audit-trail.md)) |
| `audit:verify-jsonl` | Deterministic NDJSON integrity digest (`stdin` or file argument) |
| `load:rate-local` | Burst `POST /api/v1/scans` until HTTP 429 (local dev; `BASE_URL`, `BURST_LIMIT`) |
| `pen-test:smoke` | Print curl snippets for quick manual probes (`BASE_URL` optional) |
| `blackglassctl` | Minimal health / scan CLI (`node scripts/blackglassctl.mjs help` pattern) |
| `prune:webhooks` | Delete old `saas_webhook_idempotency` rows (`DATABASE_URL`, optional `--days=`) |
| `stripe:setup` | Interactive Stripe webhook/price bootstrap ([script](scripts/stripe-setup.mjs)) |
| `do:apply-stage0` | Applies Stage-0 auth env on an existing DO app |

**DigitalOcean App Platform:** deploy builds use `npm ci` and `next build` only; rely on this repo’s GitHub Actions for `lint`. ESLint on DO builders is a common source of flaky or persistent failures if you add it to `build_command` — see [.do/README.md](.do/README.md#eslint-and-app-platform).

## Maintenance & upgrades

- **Dependabot:** Weekly npm PRs — triage on GitHub (merge or close with rationale); **`npm audit --audit-level=high --omit=dev`** runs on every CI push. Moderate **`postcss`** advisories via **`next/node_modules`** may persist until **Next** ships patched deps — avoid **`npm audit fix --force`**. DevDependency **`postcss`** stays on **^8.5.x** for direct toolchain use.
- **SBOM artifact:** CI uploads `cyclonedx-sbom.json` from `npm run sbom` — diff across releases or feed into dependency review alongside Dependabot / Dependency review for transitive CVEs.
- **Lint:** **`eslint .`** + **`eslint.config.mjs`** (Next **`core-web-vitals`** flat preset); `next lint` is not used.
- **SEO / discovery:** **`NEXT_PUBLIC_APP_URL`** feeds canonical/meta Open Graph (**no Twitter / social-account fields**); **`/sitemap.xml`** + **`/robots.txt`**; staging uses **`NEXT_PUBLIC_SITE_NOINDEX=true`** (see [.env.example](.env.example)).
- **Next.js 16:** `main` ships **next@16** ([upgrade notes](docs/nextjs-16-upgrade.md)).
- **`verify:stage0`:** Run before pushing substantive changes — same gates as CI (lint, OpenAPI, Zod schema diff, typecheck, unit tests, production build). Under OneDrive + Windows quirks, prefer **`npm run verify:stage0:clean`** (see [docs/troubleshooting-local-build.md](docs/troubleshooting-local-build.md)).

## Architecture overview

Multi-tenant SaaS console with Clerk for auth, Drizzle ORM + PostgreSQL for data, Stripe for billing, and DigitalOcean App Platform for hosting. See [PROJECT_FILES.md](PROJECT_FILES.md) for the full file map.

### Key data-flow invariants

| Concern | Canonical file |
|---------|---------------|
| Tenant auth context | [`src/lib/saas/auth-context.ts`](src/lib/saas/auth-context.ts) — `requireTenantContext()` is the entry point for every authenticated route |
| Authorization policy | [`src/lib/saas/operations.ts`](src/lib/saas/operations.ts) — `can*` checks + `ensure*` throwing wrappers; never duplicated in route handlers |
| Data isolation (RLS) | [`src/db/index.ts`](src/db/index.ts) — `withTenantRls` for app reads/writes, `withBypassRls` for webhooks/migrations only |
| Schema | [`src/db/schema.ts`](src/db/schema.ts) + migrations in [`docs/migrations/`](docs/migrations/) |
| Billing | [`src/lib/saas/stripe-sync.ts`](src/lib/saas/stripe-sync.ts) — idempotent status mapping from Stripe events |
| Plan limits | [`src/lib/saas/plans.ts`](src/lib/saas/plans.ts) — only source of `hostLimit` / `paidSeatLimit` |
| Observability | [`src/lib/observability/sentry-saas.ts`](src/lib/observability/sentry-saas.ts) — Sentry tags `tenant_id`, `user_id`, `plan`, `env` |

### Migration safety

- Always connect via direct port `25060` (not pgBouncer `25061`) when running `drizzle-kit migrate`.
- Migration `008_subscription_status_past_due.sql` (`ALTER TYPE ... ADD VALUE`) **must** be executed **outside a transaction block** — use `scripts/run-migration-008.mjs`.
- Apply migrations `004`–`006`, `008` first. Deploy app. Then apply `007` (RLS policies) once the app is confirmed live and setting `bg.tenant_id` GUC per request.

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
- Audit trail: [docs/audit-trail.md](docs/audit-trail.md) (legacy append + optional Postgres + SaaS `saas_audit_events`)
- Scaling: collectors [docs/collector-fleet-scaling.md](docs/collector-fleet-scaling.md) · Redis rate-limit (multi-instance): [docs/rate-limit-redis-adrs.md](docs/rate-limit-redis-adrs.md) · Limits table: [docs/http-rate-limit-budgets.md](docs/http-rate-limit-budgets.md)
- Auth / billing matrix (Clerk vs legacy, Stripe): [docs/auth-clerk-legacy-matrix.md](docs/auth-clerk-legacy-matrix.md)
- Clerk ops checklist: [docs/clerk-ops-checklist.md](docs/clerk-ops-checklist.md)
- Session / CSRF notes: [docs/session-security-notes.md](docs/session-security-notes.md)
- SaaS audit retention: [docs/data-retention-saas.md](docs/data-retention-saas.md)
- Webhook semantics & failures: [docs/webhook-processing.md](docs/webhook-processing.md)
- Residency: [docs/data-residency.md](docs/data-residency.md)
- i18n prep: [docs/i18n-prep.md](docs/i18n-prep.md)
- Terraform sketch: [docs/terraform-skeleton.md](docs/terraform-skeleton.md)
- Lighthouse CI (optional): [docs/lighthouse-ci.md](docs/lighthouse-ci.md)
- Next.js bumps: [docs/nextjs-16-upgrade.md](docs/nextjs-16-upgrade.md) — branch **`release/next-16`** tracks preparatory merges.
- Architecture spine: [docs/architecture-flow.md](docs/architecture-flow.md)

## Product front door (marketing vs console vs demo)

- **`/`** — Public landing (no auth). Explains the product; primary CTAs point to **`/demo`** and trial/sign-up flows.
- **`/product`** — Dedicated product summary page (public; also linked from the marketing nav).
- **`/dashboard`** — Authenticated fleet console when [Clerk is configured](docs/saas-clerk-rbac.md); with Clerk off, local/dev uses legacy session or open access depending on **`AUTH_REQUIRED`**.
- **`/demo`** — **Sample workspace only**: seeded fictional data (`src/lib/demo/`), no inventory or scan side effects. “Real” actions open an upgrade modal; never mixed with Postgres tenants.
- **Pricing & seats** — Trial, paid-seat vs viewer model, and RBAC are documented in **[docs/saas-clerk-rbac.md](docs/saas-clerk-rbac.md)** (code sources: `src/lib/saas/plans.ts`, `permissions.ts`, `seats.ts`, `trial.ts`).

### Authenticated request path (Clerk SaaS)

```mermaid
flowchart LR
  MW[middleware.ts + x-request-id]
  CK[Clerk session + orgId]
  TA[requireTenantAuth + optional MFA gate]
  TP[requireTenantPermission and operational / trial checks]
  H[API handler]
  AU[emitSaasAudit / emitSaasSecurity]
  MW --> CK --> TA --> TP --> H --> AU
```

### Billing & webhooks (Clerk + Stripe)

```mermaid
sequenceDiagram
  participant U as User (owner)
  participant C as Console
  participant K as Clerk
  participant S as Stripe
  participant W as /api/checkout/webhook
  participant DB as Postgres

  U->>C: Open pricing / billing portal
  C->>K: Session + org context
  C->>S: Checkout / portal session
  S-->>W: subscription.updated / checkout.session.completed
  W->>DB: sync saas_subscriptions + webhook idempotency
  W-->>C: Audit + plan limits effective on next request
```

## Project map

Tracked layout and rationale: [PROJECT_FILES.md](PROJECT_FILES.md)

## Responsible disclosure

If you discover a security issue: open a **private** advisory with repo maintainers; do not file public tickets with exploit details until coordinated.
