# DigitalOcean / deploy — operator do list

Action items after **`npm run do:apply-stage0`** or any prod deploy. Copy into a ticket and check off.

---

## App Platform

- [ ] **Browser:** Confirm **login** works (`AUTH_REQUIRED=true`); no redirect loops. Session relies on **`AUTH_SESSION_SECRET`** (set by script or DO dashboard — value not shown in logs).
- [ ] **`NEXT_PUBLIC_APP_URL`** on the App Platform component matches the live **`https://…`** origin (RUN_AND_BUILD_TIME). If you change it, trigger a **rebuild** so Next inlines the correct URL.
- [ ] **Collector:** Set **`COLLECTOR_HOST_1`** (+ optional **`_NAME`**, **`COLLECTOR_USER`**) and **`SSH_PRIVATE_KEY`** or **`SECRET_PROVIDER`** + provider tokens so **`GET /api/v1/hosts`** returns real rows (not `0 items`).
- [ ] **`npm run verify:staging`** with **`STAGING_URL=https://<your-host>`** — all checks pass after each deploy.
- [ ] **Optional:** `VERIFY_SECRETS_PROBE=1` for one extra health check (do not hammer; rate limits).
- [ ] Deployment failure **alerts** enabled in App Platform → Notifications.
- [ ] GitHub repo secret **`STAGING_URL`** → run workflow **Staging smoke** (`workflow_dispatch`) after deploys.

## Container Registry

- [ ] Registry exists in the DO account (create once: **DO Console → Container Registry → Create**).
- [ ] Image pushed: `.\scripts\do-docker-push.ps1 -RegistryName <name>` (requires `DIGITALOCEAN_ACCESS_TOKEN` + `BLACKGLASS_PUBLIC_URL`). Use a placeholder URL on first deploy; rebuild after the real default-route URL is known.
- [ ] App Platform service references the registry image and the correct tag (`latest` or a pinned SHA).
- [ ] Old untagged/unused images cleaned up periodically (DO Console → Container Registry → Garbage Collection).

## Volumes (persistence)

- [ ] Volume `blackglass-baselines` created in **nyc3** (same region as the App Platform app): `.\scripts\create-do-volume.ps1 -Token <token>`.
- [ ] Volume **attached** to the App Platform app component (App Platform → Settings → Storage).
- [ ] `BASELINE_STORE_PATH` and `DRIFT_HISTORY_PATH` point at the mount path and are writable by the app user (see **`docs/operator-guide.md`**).
- [ ] Confirmed baselines and drift history survive an app **restart** (run a baseline, restart the app, verify data is present).
- [ ] Volume **snapshot** or backup plan in place before any destructive migration.

## Droplets (collector targets)

- [ ] Lab Droplet provisioned if needed: `.\scripts\create-do-droplet.ps1 -Token <token>` — Ubuntu 22.04, nyc3, tag `collector-target`.
- [ ] **`blackglass-collector`** SSH key registered with DO account: `.\scripts\register-do-key.ps1 -Token <token>`.
- [ ] Collector user and `sudoers` entry configured on each target Droplet: `.\scripts\setup-collector-user.sh`.
- [ ] `COLLECTOR_HOST_1` (and `_2`, `_3` …) env vars updated in App Platform with the Droplet IP(s).
- [ ] SSH port confirmed (default `22`; lab may expose `2222`) and App Platform firewall / inbound rules allow egress on that port.
- [ ] Droplets **tagged** `blackglass` + `collector-target` for easy DO Console filtering.
- [ ] Unused lab Droplets deleted after testing to avoid unnecessary billing (`DO Console → Droplets → Destroy`).

## SSH Keys (DO account)

- [ ] Key `blackglass-collector` present under **DO Account → Security → SSH Keys** (registered by `register-do-key.ps1`).
- [ ] Private key stored **only** in the secret provider (`SSH_PRIVATE_KEY` secret) — never committed to git.
- [ ] Key rotated and old key removed from DO account when a team member leaves or key is suspected compromised.

---

## Product exit (Stage 0)

- [ ] **Baseline → scan → drift** validated on at least one **real SSH** host; operators trust **Settings → Runtime health**.

See also: **`docs/staging-deployment-checklist.md`**, **`docs/saas-customer-roadmap.md`**.
