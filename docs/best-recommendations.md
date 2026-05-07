# Best recommendations (living list)

**Audience:** Internal — engineering and operators only. This file is **not** linked from the public site or console UI; it lives under `docs/` in the repo.

**Last reviewed:** 2026-05-07
Update this file when you merge major UI, auth, or E2E work so prioritisation stays honest.

## Recently landed (on main, deployed)

- **Clerk + theme** — `ClerkThemedProvider` follows light/dark tokens; root layout order keeps `ThemeProvider` outside Clerk.
- **Stable default E2E** — Playwright dev server clears Clerk keys unless `PLAYWRIGHT_CLERK=1`; smoke uses a cross-platform palette shortcut.
- **SaaS guards** — `saas-access` returns structured JSON on unexpected errors instead of throwing.
- **A11y automation** — `@axe-core/playwright` on key console routes; markup fixes for grid/region and nested focus.
- **UX polish** — `prefers-reduced-motion`, drift/evidence striping, hosts inventory `role="region"`, PWA icon + manifest.
- **Trust / product copy** — `/changelog`, security DR subsection, settings data-retention blurb, footer link.
- **Mock correctness** — `loadHostDetail` in mock mode without collector; evidence catalog + Evidence UI seeds aligned with API.
- **Spec hygiene** — deduped `openapi/blackglass.yaml` `/reports`; `npm run openapi:types` → `src/types/openapi.d.ts`.
- **Observability** — `ui.theme` Sentry tag on theme change (client).
- **SSR silence** — `Providers.tsx` uses `dynamic(ssr:false)` for overlays; `RunScanButton` has mounted guard.
- **WCAG AA color-contrast** — Dark `--text-faint` lifted to `#8494a3`; axe `disableRules` exception removed.
- **Envelope encryption** — `KMS_PROVIDER=local` + `KMS_LOCAL_SECRET` in Doppler; `SSH_PRIVATE_KEY` stored as AES-256-GCM JSON blob.
- **CI drift check** — OpenAPI types codegen drift check step in `ci.yml` (`git diff --exit-code src/types/openapi.d.ts`).
- **Security headers** — `Cross-Origin-Opener-Policy: same-origin-allow-popups` + `Cross-Origin-Resource-Policy: same-origin` added to `next.config.ts`.
- **Lighthouse extended** — matrix now includes `/security` and `/changelog`.
- **`tenant_credentials` table** — Per-tenant SSH key store (envelope-encrypted, RLS-enforced, applied to live DB).
- **`saasCollectorHosts.credentialId`** — FK to `tenant_credentials`; migration 0005 applied.
- **DB secret provider** — `SECRET_PROVIDER=db` now supported; `DbSecretProvider` resolves SSH keys from DB with per-tenant RLS.
- **tenantId threading** — `CollectScanOptions.tenantId` propagated through `scanContext()`, baseline-capture service, scan/baseline API routes, and BullMQ scan worker.
- **Staging smoke CI trigger** — `workflow_run` on CI success for `main`; `VERIFY_SECRETS_PROBE=1` enabled.
- **Rate-limit observability** — `GET /api/admin/rate-limits` returns Redis sorted-set hit counts (or memory-backend notice); `getRateLimitStats()` in `rate-limit-redis.ts`.

## Recently retired (May 2026)

- **Public auto-provisioning showcase sandbox** — high operational
  cost, low conversion value. Replaced by a static walkthrough at
  `/demo/sandbox`, a 1-redirect at `/demo/showcase`, and the
  long-lived sales-demo VM `blackglass-lab-01`. See
  `docs/runbooks/operations.md` § 4b–4c.

## P0 — do next

1. **Stripe live cutover** — `docs/stripe-live-cutover.md`. Set
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRO_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in
   Doppler production; register the webhook in the Stripe dashboard;
   smoke a live-mode checkout before opening to paying customers.
2. **Per-tenant KMS / BYOK** — today all DEKs share a single
   KMS-managed KEK. Per-tenant key separation is the next clear-ask
   from enterprise prospects (see `docs/security-compliance.md` § 11).
3. **Helm chart parity for `sandbox-worker`** — currently shipped as a
   separate artefact. Self-hosted customers who want remediator
   sandbox verification need a manual Deployment.

## P1 — strong ROI

4. **Drift trend chart annotations** — overlay deployment / approval
   markers on the dashboard chart so trend → cause is visible without
   pivoting to the audit page.
5. **Rate-limit dashboards** — `GET /api/admin/rate-limits` is shipped
   but not surfaced in Settings → Runtime health UI. Wire it.
6. **Storybook or Ladle** for shell primitives (Badge, Card, table
   patterns) — speed up UI iteration and catches token regressions.
7. **i18n** — if EU public sector matters, plan `next-intl` or
   equivalent; notes in `docs/internationalization.md`.

## Done (do not re-add to P0)

- Envelope encryption + KMS provider abstraction
  (`local` / `vault` / `awskms`).
- HMAC-signed outbound webhooks with rotation window.
- Postgres RLS + `withTenantRls` wrapper everywhere SaaS reads/writes.
- BullMQ queues with dedicated `scan-worker`, `ops-worker`,
  `sandbox-worker`.
- Hash-tracked migrations + PR-time + CI-time integrity check.
- Sentry → PagerDuty bridge (gated by `BLACKGLASS_AIRGAPPED`).
- DAST scheduled on staging (weekly + on-demand).
- PDF report generation + structured-error retry endpoint.
- Settings page tabbed nav (6 categories, 19 sections).
- Dashboard "Invalid Date" + tiny-chart fixes.

## Hygiene to keep

- Run **`npm run verify:stage0`** (or full release verify) before each merge; keep **`npm run test:e2e`** green on CI.
- Rotate any PAT or webhook secret ever pasted into chat; use `gh auth` / keyring or CI secrets only.
- After large UI changes, refresh pixel snapshots where you use `@pixel` tests (Linux/CI).

See also: **`docs/release-checklist.md`**, **`docs/saas-customer-roadmap.md`**, **`docs/staging-deployment-checklist.md`**, **`docs/wiring-checklist.md`**.
