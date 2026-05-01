# DigitalOcean / deploy — operator do list

Action items after **`npm run do:apply-stage0`** or any prod deploy. Copy into a ticket and check off.

## Post–Stage 0 (internal / design partner)

- [ ] **Browser:** Confirm **login** works (`AUTH_REQUIRED=true`); no redirect loops. Session relies on **`AUTH_SESSION_SECRET`** (set by script or DO dashboard — value not shown in logs).
- [ ] **`NEXT_PUBLIC_APP_URL`** on the App Platform component matches the live **`https://…`** origin (RUN_AND_BUILD_TIME). If you change it, trigger a **rebuild** so Next inlines the correct URL.
- [ ] **Collector:** Set **`COLLECTOR_HOST_1`** (+ optional **`_NAME`**, **`COLLECTOR_USER`**) and **`SSH_PRIVATE_KEY`** or **`SECRET_PROVIDER`** + provider tokens so **`GET /api/v1/hosts`** returns real rows (not `0 items`).
- [ ] **`npm run verify:staging`** with **`STAGING_URL=https://<your-host>`** — all checks pass after each deploy.
- [ ] **Optional:** `VERIFY_SECRETS_PROBE=1` for one extra health check (do not hammer; rate limits).

## Automation & persistence (when ready)

- [ ] GitHub repo secret **`STAGING_URL`** → run workflow **Staging smoke** (`workflow_dispatch`) after deploys.
- [ ] Mount a volume and set **`BASELINE_STORE_PATH`** / **`DRIFT_HISTORY_PATH`** if baselines and drift history must survive restarts (see **`docs/operator-guide.md`**).

## Product exit (Stage 0)

- [ ] **Baseline → scan → drift** validated on at least one **real SSH** host; operators trust **Settings → Runtime health**.

See also: **`docs/staging-deployment-checklist.md`**, **`docs/saas-customer-roadmap.md`**.
