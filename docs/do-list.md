# DigitalOcean / deploy — operator do list

Action items after **`npm run do:apply-stage0`** or any prod deploy. Copy into a ticket and check off.

---

## App Platform

- [x] **Browser:** Confirm **login** works (`AUTH_REQUIRED=true`); no redirect loops. Session relies on **`AUTH_SESSION_SECRET`** (set by script or DO dashboard — value not shown in logs).
- [x] **`NEXT_PUBLIC_APP_URL`** on the App Platform component matches the live **`https://…`** origin (RUN_AND_BUILD_TIME). If you change it, trigger a **rebuild** so Next inlines the correct URL.
- [x] **Collector:** Set **`COLLECTOR_HOST_1`** (+ optional **`_NAME`**, **`COLLECTOR_USER`**) and **`SSH_PRIVATE_KEY`** or **`SECRET_PROVIDER`** + provider tokens so **`GET /api/v1/hosts`** returns real rows (not `0 items`).
- [x] **`npm run verify:staging`** with **`STAGING_URL=https://<your-host>`** — all checks pass after each deploy.
- [x] **Optional:** `VERIFY_SECRETS_PROBE=1` for one extra health check (do not hammer; rate limits).
- [x] Deployment failure **alerts** enabled — `alerts: - rule: DEPLOYMENT_FAILED` is declared in `.do/app.yaml` and applied on every `doctl apps create/update`. DO Console → App → Settings → Notifications can add email/Slack recipients on top.
- [x] GitHub repo secret **`STAGING_URL`** → run workflow **Staging smoke** (`workflow_dispatch`) after deploys.

## Container Registry

- [x] Registry exists in the DO account (create once: **DO Console → Container Registry → Create**).
- [x] Image pushed: `.\.scripts\do-docker-push.ps1 -RegistryName <name>` (requires `DIGITALOCEAN_ACCESS_TOKEN` + `BLACKGLASS_PUBLIC_URL`). Use a placeholder URL on first deploy; rebuild after the real default-route URL is known.
- [x] App Platform service references the registry image and the correct tag (`latest` or a pinned SHA).
- [x] Old untagged/unused images cleaned up periodically (DO Console → Container Registry → Garbage Collection).

## Volumes (persistence)

- [x] ~~Volume `blackglass-baselines` created in **nyc3**~~ — **replaced by DO Spaces** (`blackglass-state` bucket, nyc3). Volumes section is obsolete.
- [x] ~~Volume **attached** to the App Platform app component~~ — N/A (Spaces).
- [x] `BASELINE_STORE_PATH` / `DRIFT_HISTORY_PATH` — N/A; using **Spaces adapter** (`DO_SPACES_*` env vars set in App Platform + Doppler dev/stg).
- [x] Confirmed baselines and drift history survive an app **restart** (baseline captured 2026-05-02T13:15:47Z; app restarted via DO API deployment `7abe7ddb`; baseline present post-restart with same capturedAt — Spaces adapter confirmed).
- [x] ~~Volume snapshot or backup plan~~ — Spaces bucket lifecycle / versioning policy recommended; bucket is private.

## Droplets (collector targets)

- [x] Sales-demo lab Droplet provisioned: `blackglass-lab-01` at `134.209.180.255` (lon1). Provisioned by `scripts/create-do-droplet.ps1` on 2026-05-07; replaces the previous nyc3 host that was deleted in error.
- [x] **`blackglass-collector-v2`** SSH key registered with DO account; both `root` and `blackglass` user authorize the personal + collector keys via cloud-init.
- [x] `blackglass` user shell = `/bin/bash`; sudoers (`/etc/sudoers.d/blackglass-scan`) NOPASSWD on read-only audit commands + the seed script.
- [x] Droplet `ufw` enabled, port 22 only.
- [x] DO Cloud Firewall `blackglass-lab-fw` attached for inbound IP allowlisting.
- [x] `COLLECTOR_HOST_1=134.209.180.255` set in App Platform; `GET /api/v1/hosts` returns this host.
- [x] Droplet tagged `blackglass` + `collector-target`.

## SSH Keys (DO account)

- [x] Key `blackglass-collector-v2` present under **DO Account → Security → SSH Keys**.
- [x] Private key stored only in secret provider (`SSH_PRIVATE_KEY` in Doppler / App Platform secret).
- [ ] Key rotated and old key removed from DO account when a team member leaves or key is suspected compromised. *(ongoing ops hygiene)*

---

## Product exit (Stage 0)

- [x] **Baseline → scan → drift** validated on `blackglass-lab-01` (`167.172.224.47`); `Settings → Runtime health` shows `adapter: spaces, configured: true`.

See also: **`docs/staging-deployment-checklist.md`**, **`docs/saas-customer-roadmap.md`**.
