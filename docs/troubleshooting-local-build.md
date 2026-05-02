# Local build troubleshooting

## **`next build`: `EINVAL … readlink` under `.next`**

Common when the repo lives under **OneDrive / iCloud / cloud-synced folders** on Windows — the toolchain expects normal NTFS semantics.

**Fix:** Run **`npm run clean:next`** (or **`npm run verify:stage0:clean`** before gates), or delete `.next/` manually (`Remove-Item -Recurse .next` in PowerShell). Long-term, clone onto a non-synced path (e.g. `C:\\dev\\blackglass`). Root **`.cursorignore`** lists `.next/` to reduce indexer churn.

## **Playwright steals port 3100**

Set **`PLAYWRIGHT_PORT`** env or terminate stray `next dev` before `npm run test:e2e`.

## **Staging / ZAP from laptop**

Prefer GitHub-hosted runners hitting HTTPS origins — see **`docs/github-actions-first-run.md`**.
