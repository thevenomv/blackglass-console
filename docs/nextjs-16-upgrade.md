# Next.js 16 upgrade checklist

Use behind a **`release/next-16`** (or similar) branch; merge only after CI + staging burn-in.

## Pre-flight

- [ ] **`npm outdated next react react-dom`** — note majors.
- [ ] Read **Next.js 16 migration guide** and **breaking changes** for App Router / middleware / `next/font` / Turbopack defaults.
- [ ] Confirm **eslint flat config** (this repo migrated off `next lint` already).

## Codebase-specific

- [ ] **`next.config.ts`**: CSP, **`serverExternalPackages: ["ssh2"]`**, Sentry **`withSentryConfig`** compatibility with new adapter.
- [ ] **`middleware.ts`**: Edge runtime APIs (crypto, matchers).
- [ ] **Playwright** `webServer`: port + env matrix (`PLAYWRIGHT_LIVE`).
- [ ] **`ignoreDuringBuilds`** / **`typescript.ignoreBuildErrors`** — decide whether CI remains the gate or production build doubles checks.

## Validation

```bash
npm run verify:stage0
PLAYWRIGHT_LIVE=1 npm run test:e2e:live
```

Deploy to staging, run **`npm run verify:staging`** against live URL.
