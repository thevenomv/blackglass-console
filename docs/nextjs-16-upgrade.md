# Next.js 16 upgrade checklist

**Status:** `main` is on **Next.js 16** (`next@^16`). Keep this file for the next major or when ecosystem packages lag.

Prep work may still use **`origin/release/next-16`** for big-bang experiments; merge upgrades only once ecosystem + this checklist are green.

## Pre-flight

- [x] **`npm outdated next react react-dom`** — note majors.
- [ ] Read **Next.js 16 migration guide** and **breaking changes** for App Router / middleware / `next/font` / Turbopack defaults (spot-check on each bump).
- [x] Confirm **eslint flat config** (this repo migrated off `next lint` already).

## Codebase-specific

- [x] **`next.config.ts`**: CSP, **`serverExternalPackages`** (includes `ssh2`, `pg`, `ioredis`), Sentry **`withSentryConfig`** — re-verify on each Next minor.
- [x] **`middleware.ts`**: Edge runtime APIs (crypto, matchers).
- [x] **Playwright** `webServer`: port + env matrix (`PLAYWRIGHT_LIVE`).
- [x] **`eslint` in `next.config`** — removed in Next 16 typings; lint runs only via **`npm run lint`** / CI (not during `next build`).

## Validation

`main` ships **Next 16.x** builds with **Turbopack** (`next build` log shows “Turbopack”) — timings differ vs legacy webpack-era CI logs.

```bash
npm run verify:stage0
PLAYWRIGHT_LIVE=1 npm run test:e2e:live
```

Deploy to staging, run **`npm run verify:staging`** against live URL.
