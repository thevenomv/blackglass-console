# Staging deployment checklist (pre–SaaS beta)

Use before inviting external operators or pilots. Copy into a ticket and mark each item.

For a shorter **post–Stage 0 / DO** checklist (login, collector, verify), see **`docs/do-list.md`**.

## Build & config

- [ ] **`NEXT_PUBLIC_APP_URL`** matches staging HTTPS URL (build-time).
- [ ] **`NEXT_PUBLIC_USE_MOCK=false`** on staging.
- [ ] **`AUTH_REQUIRED=true`**; session secret rotated and stored only in platform secrets.
- [ ] **Collector:** `COLLECTOR_HOST_*` point at **non-production** lab hosts (or clearly labeled staging servers).
- [ ] **Secrets:** `SECRET_PROVIDER` + provider env (Doppler/Infisical/Vault/env) set; no keys in git.
- [ ] **Persistence (recommended):** `BASELINE_STORE_PATH` and optionally `DRIFT_HISTORY_PATH` on a **mounted volume**; path writable by the app user.

## Automation (optional)

- GitHub: add repository secret **`STAGING_URL`**, then run workflow **Staging smoke** (Actions → manual dispatch).
- DigitalOcean (existing App Platform app): with **`DIGITALOCEAN_ACCESS_TOKEN`** set locally, run **`python scripts/do_apply_stage0.py`** to set **`AUTH_REQUIRED=true`** and ensure **`AUTH_SESSION_SECRET`** (generates one if missing). See script docstring for **`BLACKGLASS_APP_ID`** / **`AUTH_SESSION_SECRET`** overrides.

## Manual command

```bash
STAGING_URL=https://your-staging-host.example npm run verify:staging
# Optional second check (respects server rate limit):
VERIFY_SECRETS_PROBE=1 STAGING_URL=https://... npm run verify:staging
```

## Smoke after deploy

- [ ] **`npm run verify:staging`** (with **`STAGING_URL`**) — all checks pass.
- [ ] Optional: **`VERIFY_SECRETS_PROBE=1`** once per run (rate-limited on server).
- [ ] **Baseline:** `POST /api/v1/baselines` succeeds for at least one host.
- [ ] **Scan:** `POST /api/v1/scans` → poll until **succeeded** (or document known failures).
- [ ] **UI:** Login, dashboard, drift grid, Settings **Runtime health** panel matches expectations.
- [ ] **`Mock data` banner absent** once `NEXT_PUBLIC_USE_MOCK=false` (pilots must not confuse demo payloads with telemetry).

## Billing (Stripe pilot)

- [ ] **`STRIPE_*` keys:** test mode complete first; restricted live keys only when ready (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — see **`.env.example`**).
- [ ] **`npm run stripe:setup`** (or parity in dashboard): price, webhook URL on deployed host, **`checkout.session.completed`** routed to **`/api/checkout/webhook`**.
- [ ] **Live-ish test:** Checkout with a small recurring price → webhook → **`BLACKGLASS_PLAN`** persisted (Spaces) without redeploy (**`npm run stripe:setup`** / operator guide).

## Security & ops

- [ ] **Firewall:** SSH from App Platform egress IPs only (or VPN), if policy requires.
- [ ] **Backups:** If using files — snapshot or backup plan for volume; if using DB — backup enabled.
- [ ] **Alerts:** App Platform deployment failure notifications on.
- [ ] **Runbook:** Link **`docs/operator-guide.md`** and **`docs/saas-customer-roadmap.md`** for on-call.

## Not required for staging (track for GA)

- Multi-tenant DB, SSO, formal SLA, pen test sign-off — see SaaS roadmap Stage 3+.
