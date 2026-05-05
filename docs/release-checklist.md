# Release checklist (human)

Run automated verify first:

```bash
npm run verify:release
```

Then:

1. **Themes:** Cold load in a private window — confirm `data-theme` matches system when `localStorage` is empty; toggle Light/Dark and reload.
2. **PWA:** Open DevTools → Application → Manifest; confirm `/manifest.webmanifest` parses.
3. **404 / errors:** Hit a bogus path (styled `not-found`); trigger or inspect `global-error` styling in staging.
4. **E2E:** `npm run test:e2e` against a running build or rely on CI.
5. **Theme tokens:** `npx playwright test tests/e2e/theme-tokens.spec.ts`.
6. **Optional pixels:** On Linux or CI docker, `npx playwright test tests/e2e/theme-visual.spec.ts --update-snapshots` before a marketing release; commit snapshots.
7. **Stripe / billing:** Smoke checkout on staging with test keys; confirm success/cancel URLs.
8. **Ingest / collector:** Rotate ingest key on staging; confirm `INGEST_API_KEY` workflow documented for operators.
9. **Content:** Legal pages (`/terms`, `/privacy`, `/dpa`) render at comfortable line length.
10. **Email / exports:** If you changed report PDF or invite copy this release, spot-check one export and one transactional email in **light** branding (see `docs/exports-and-comms.md`).
