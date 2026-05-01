# Doppler + DigitalOcean (App Platform) for Blackglass

Blackglass can load SSH material at scan time from Doppler (`SECRET_PROVIDER=doppler`). On DigitalOcean App Platform you can either **push secrets from Doppler** (managed sync) or **set env vars manually** (service token).

## 1. Doppler account and project

1. Sign up at [Doppler](https://www.doppler.com/).
2. Create a **project** (for example `blackglass`).
3. Create configs that match your environments (for example `dev` and `prd`).

Store at least:

- `**SSH_PRIVATE_KEY`** — PEM for the collector SSH user (or another name; then set `BLACKGLASS_SSH_SECRET_NAME` in the app to that key name).

Optional Blackglass env (see operator guide):

- `SECRET_PROVIDER=doppler`
- `DOPPLER_TOKEN` — **service token** with read access to the target config (required on App Platform / Docker; locally, `npm run dev:doppler` can use the CLI session and fetch via `doppler secrets download` without storing the token in Doppler)
- `DOPPLER_PROJECT`, `DOPPLER_CONFIG`
- `COLLECTOR_HOST_1`, … — target IPs or hostnames

Vault-only:

- `BLACKGLASS_VAULT_REVOKE_AFTER_SCAN=true` — after each scan, revoke JIT SSH certs (Vault provider only).

## 2. Authorize DigitalOcean from Doppler (“sync to App Platform”)

Doppler can sync secrets into DO and trigger redeploys. Official flow:

1. In Doppler, open the **config** you want to sync (for example `prd`).
2. **Integrations** → **Add Sync** → **DigitalOcean**.
3. You are redirected to **DigitalOcean** to **approve Doppler’s access** to your account (OAuth-style authorization).
4. Back in Doppler, choose the **App Platform** app and finish the sync configuration.

Details and caveats (DO resource variables vs Doppler references) are in [Doppler’s App Platform docs](https://docs.doppler.com/docs/digitalocean-app-platform).

After sync, ensure the app still sets non-secret **plain** variables such as `SECRET_PROVIDER`, `DOPPLER_PROJECT`, `DOPPLER_CONFIG`, and `COLLECTOR_HOST_*` if those are not synced from Doppler.

## 3. Alternative: manual App Platform env vars (no sync)

1. In Doppler: **Access** → create a **Service Token** scoped to the project + config.
2. In DO App Platform: **Settings** → **App-Level Environment Variables**:
  - Mark `**DOPPLER_TOKEN`** as **encrypted/secret**.
  - Set `SECRET_PROVIDER=doppler`, `DOPPLER_PROJECT`, `DOPPLER_CONFIG`, hosts, and optionally `BLACKGLASS_SSH_SECRET_NAME`.

Redeploy the app so workers pick up new variables.

## 4. Local credential smoke test (optional)

Without installing the Doppler CLI, you can confirm `DOPPLER_TOKEN`, project, and config can download secrets and that `SSH_PRIVATE_KEY` (or `BLACKGLASS_SSH_SECRET_NAME`) exists:

1. Copy `.env.example` to `.env.local` and set `SECRET_PROVIDER`, `DOPPLER_`*, and optionally `COLLECTOR_HOST_1`.
2. Run `npm run doppler:verify` after loading env, e.g. `node --env-file=.env.local scripts/doppler-verify.mjs` or set variables in your shell and `npm run doppler:verify`.

The script only reports success and character count — it does not print PEMs.

To run the dev server with the **CLI** injecting all Doppler secrets: [install the Doppler CLI](https://docs.doppler.com/docs/install-cli), then `npm run dev:doppler`.

## 5. Health check and rate limits

`GET /api/health?probe=secrets` checks reachability of the configured secret backend. It is **rate-limited per client IP** (see `checkHealthSecretsProbeRate` in `src/lib/server/rate-limit.ts`) so automated monitors should not poll it too aggressively.

## 6. Reference

- [Doppler · DigitalOcean integration](https://www.doppler.com/integrations/digitalocean)
- [Doppler docs: DigitalOcean App Platform](https://docs.doppler.com/docs/digitalocean-app-platform)