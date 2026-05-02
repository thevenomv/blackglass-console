# Local build troubleshooting

## **`next build`: `EINVAL … readlink` under `.next`**

Common when the repo lives under **OneDrive / iCloud / cloud-synced folders** on Windows — the toolchain expects normal NTFS semantics.

**Fix:** Delete `.next/` then rebuild (`Remove-Item -Recurse .next` PowerShell); long-term, clone Blackglass onto a non-synced path (e.g. `C:\\dev\\blackglass`). Add **`.cursorignore`** covering `.next/` (this repo ships one) to reduce indexer churn.

## **Playwright steals port 3100**

Set **`PLAYWRIGHT_PORT`** env or terminate stray `next dev` before `npm run test:e2e`.

## **Staging / ZAP from laptop**

Prefer GitHub-hosted runners hitting HTTPS origins — see **`docs/github-actions-first-run.md`**.
