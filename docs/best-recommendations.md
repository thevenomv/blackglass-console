# Best recommendations (living list)

**Audience:** Internal — engineering and operators only. This file is **not** linked from the public site or console UI; it lives under `docs/` in the repo.

**Last reviewed:** 2026-05-03  
Update this file when you merge major UI, auth, or E2E work so prioritisation stays honest.

## Recently landed (feature branch / main soon)

- **Clerk + theme** — `ClerkThemedProvider` follows light/dark tokens; root layout order keeps `ThemeProvider` outside Clerk.
- **Stable default E2E** — Playwright dev server clears Clerk keys unless `PLAYWRIGHT_CLERK=1`; smoke uses a cross-platform palette shortcut.
- **SaaS guards** — `saas-access` returns structured JSON on unexpected errors instead of throwing.
- **A11y automation** — `@axe-core/playwright` on key console routes; markup fixes for grid/region and nested focus.
- **UX polish** — `prefers-reduced-motion`, drift/evidence striping, hosts inventory `role="region"`, PWA icon + manifest.
- **Trust / product copy** — `/changelog`, security DR subsection, settings data-retention blurb, footer link.
- **Mock correctness** — `loadHostDetail` in mock mode without collector; evidence catalog + Evidence UI seeds aligned with API.
- **Spec hygiene** — deduped `openapi/blackglass.yaml` `/reports`; `npm run openapi:types` → `src/types/openapi.d.ts`.
- **Observability** — `ui.theme` Sentry tag on theme change (client).

## P0 — do next

1. **Merge + deploy** — Land the feature branch on the branch your production tracks (`main` / `staging`), then confirm the live revision in your host (DO, Vercel, etc.).
2. **Silence RunScanButton SSR noise** — Logs still show `useScanJobs` during SSR in some cases; tighten client boundary or lazy mount so server render never touches scan context.
3. **Enable color-contrast in axe** — Tests currently disable `color-contrast`; fix token violations (or document scoped exceptions), then re-enable the rule.

## P1 — strong ROI

4. **CI: validate OpenAPI codegen** — Add a step after `openapi:types` that fails if `src/types/openapi.d.ts` drifts (`git diff --exit-code` or dedicated check).
5. **Lighthouse workflow** — Extend `.github/workflows/lighthouse.yml` URLs to `/security`, `/changelog`, and one app shell route behind mock.
6. **CSP & security headers** — Document intended policy in `docs/` and align `next.config` / edge headers with Clerk, Stripe, and Sentry.
7. **Rate-limit dashboards** — Expose counters or logs for throttled routes in your observability stack (ties to existing `rate_limit_exceeded` events).

## P2 — platform depth

8. **Storybook or Ladle** for shell primitives (Badge, Card, table patterns) — pay off as marketing + app share tokens.
9. **Print/PDF/email** — Follow `docs/exports-and-comms.md`; wire real renderers and light-theme snapshots in CI.
10. **i18n** — If EU public sector matters, plan `next-intl` or equivalent; notes in `docs/internationalization.md`.
11. **Synthetic checks** — Schedule staging probes for `/api/health?probe=secrets` and critical SSR paths (see `docs/release-checklist.md`).

## Hygiene to keep

- Run **`npm run verify:stage0`** (or full release verify) before each merge; keep **`npm run test:e2e`** green on CI.
- Rotate any PAT or webhook secret ever pasted into chat; use `gh auth` / keyring or CI secrets only.
- After large UI changes, refresh pixel snapshots where you use `@pixel` tests (Linux/CI).

See also: **`docs/release-checklist.md`**, **`docs/saas-customer-roadmap.md`**, **`docs/staging-deployment-checklist.md`**, **`docs/wiring-checklist.md`**.
