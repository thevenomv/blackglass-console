# Best recommendations (living list)

**Audience:** Internal — engineering and operators only. This file is **not** linked from the public site or console UI; it lives under `docs/` in the repo.

**Last reviewed:** 2026-05-06  
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

## P0 — do next

1. **Stripe live cutover** — See `docs/stripe-live-cutover.md`. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in Doppler production config; register webhook in Stripe Dashboard. Smoke checkout on live mode before opening to paying customers.
2. **`SECRET_PROVIDER=db` rollout** — Once tenants have rows in `tenant_credentials`, flip `SECRET_PROVIDER=db` in Doppler and add a "default" credential row per tenant. Document the operator onboarding runbook.
3. **Tenant-scoped DB reads audit** — Verify all SaaS API routes that read DB data call `withTenantRls`; audit events, evidence bundles, and collector hosts are the primary surfaces.

## P1 — strong ROI

4. **Rate-limit dashboards** — Wire `GET /api/admin/rate-limits` into the Settings → Runtime health UI panel so operators can see throttle activity without querying logs.
5. **Storybook or Ladle** for shell primitives (Badge, Card, table patterns).
6. **Print/PDF/email** — Follow `docs/exports-and-comms.md`; wire real renderers and light-theme snapshots in CI.
7. **i18n** — If EU public sector matters, plan `next-intl` or equivalent; notes in `docs/internationalization.md`.

## Hygiene to keep

- Run **`npm run verify:stage0`** (or full release verify) before each merge; keep **`npm run test:e2e`** green on CI.
- Rotate any PAT or webhook secret ever pasted into chat; use `gh auth` / keyring or CI secrets only.
- After large UI changes, refresh pixel snapshots where you use `@pixel` tests (Linux/CI).

See also: **`docs/release-checklist.md`**, **`docs/saas-customer-roadmap.md`**, **`docs/staging-deployment-checklist.md`**, **`docs/wiring-checklist.md`**.
