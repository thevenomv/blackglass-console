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
- [ ] **Live-ish test:** Checkout with a small recurring price → webhook → `saas_subscriptions` row updated in Postgres (verify with `psql $DATABASE_URL -c "select status, plan from saas_subscriptions where tenant_id=…"`). The legacy `BLACKGLASS_PLAN` env var path is for single-tenant deployments only.

## Security & ops

- [ ] **Firewall:** SSH from App Platform egress IPs only (or VPN), if policy requires. Egress IPs available at `GET /api/public/egress-ips`.
- [ ] **Backups:** Managed Postgres daily snapshots enabled; weekly `pg_dump` to Spaces (`scripts/ops/backup-postgres.mjs`).
- [ ] **Alerts:** App Platform deployment failure notifications on; PagerDuty bridge enabled if you want Sentry-paged on-call (`PD_SENTRY_BRIDGE_ENABLED=true`, `PD_ROUTING_KEY`).
- [ ] **Runbook:** `docs/operator-guide.md` and `docs/runbooks/operations.md` linked in the on-call channel.

## SaaS staging (when running with Clerk + multi-tenancy)

For staging that mirrors the SaaS production path (which is the default
today), the following are **required**, not optional:

- [ ] **Multi-tenant DB:** Managed Postgres with the application role
      lacking `BYPASSRLS`; migrations applied via the
      `db-migrate.yml` workflow with `mode=apply`; partition integrity
      verified (`scripts/ops/verify-partition-integrity.mjs`).
- [ ] **Clerk:** publishable + secret keys + webhook signing secret;
      RBAC roles seeded.
- [ ] **Workers deployed:** `scan-worker`, `ops-worker`, and (if using
      the remediator) `sandbox-worker` running and connected to the
      staging Redis.
- [ ] **Audit verification:** `npm run audit:verify-jsonl` against an
      exported staging stream produces a stable digest.
- [ ] **Air-gap probe (if relevant):** `curl /api/health/airgap` reports
      the expected per-dispatcher state for the staging configuration.

The legacy "single-tenant staging" path (no Clerk, file-backed baselines)
remains supported for self-hosted dev environments — it just isn't a
mirror of the SaaS production path. Pick one path per staging app spec.

## Future / not required for any staging

- SOC 2 attestation, formal customer SLA, pen test sign-off — see
  `docs/saas-customer-roadmap.md`.
