# DigitalOcean account snapshot — Blackglass (Obsidian)

**Captured:** 2026-06-25 (via `npm run do:inventory` + DO API)  
**Store updates offline** — do not commit API tokens, secret env values, or full Spaces access keys.

> **Security:** If a Personal Access Token was ever pasted into chat or email, **revoke and rotate it** in [DigitalOcean → API → Tokens](https://cloud.digitalocean.com/account/api/tokens) before mothballing.

---

## Current state summary

| Signal | Status |
|--------|--------|
| App Platform `blackglass` | **Archived** — `https://blackglass-j9imo.ondigitalocean.app/api/health` returns **503**; latest deploy cause: *"app spec updated, app archived"* |
| Custom domains on app | `blackglasssec.com`, `www.blackglasssec.com` (PRIMARY) |
| Managed Postgres / Valkey in this DO account | **None** (`0` clusters) — `DATABASE_URL` / `REDIS_*` in App secrets point **outside** this account or to deleted clusters |
| Public showcase | **Disabled** (`SHOWCASE_AUTO_PROVISION_DISABLED=true`) |
| Spaces bucket (project) | `blackglass-state` (region **nyc3**) |
| Demo / sales host | Droplet **`obsidian-github-runner`** @ **167.99.59.55** (tags: `blackglass`, `rustdesk-demo`) — still **powered on** |
| RustDesk relay | **`rustdesk-server`** @ **206.189.114.207** (lon1) — **powered on** |

**Billing still running:** archived App Platform stops app compute, but **Droplets**, **Spaces**, and **DO domain registration** may still incur charges until you power off or delete them.

---

## DO Project: Blackglass

| Field | Value |
|-------|-------|
| Project ID | `2081c029-849a-4286-8b19-27717a597258` |
| Name | `Blackglass` |

### Resources assigned to project

| URN | Product |
|-----|---------|
| `do:app:526a574e-48c6-48a8-94ff-b64b93fa70df` | App Platform |
| `do:space:blackglass-state` | Spaces |
| `do:domain:blackglasssec.com` | Domain registration / DNS zone |

---

## App Platform

| Field | Value |
|-------|-------|
| App ID | `526a574e-48c6-48a8-94ff-b64b93fa70df` |
| Name | `blackglass` |
| Region | `lon` |
| Default URL | `https://blackglass-j9imo.ondigitalocean.app` |
| GitHub | `thevenomv/blackglass-console` @ `main`, deploy on push **enabled** |
| Active deployment | `fd147c97-0311-47b2-9e0f-d4f1816db7f9` (phase ACTIVE, archived app) |

### Live components (differs from committed `.do/app-git.production.yaml`)

| Component | Type | Size | Instance count | Notes |
|-----------|------|------|----------------|-------|
| `web` | service | `basic-xxs` | 1 | Run: `node .next/standalone/server.js` |
| `sandbox-worker` | worker | `basic-xxs` | 1 | Showcase disabled; worker idle |
| `db-migrate` | PRE_DEPLOY job | `basic-xxs` | 1 | Runs on deploy only |

**Not present in live app:** `scan-worker`, `ops-worker` (both documented in repo runbooks).

### Non-secret env (web) — for reactivation reference

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_APP_URL` | `https://blackglasssec.com` |
| `NEXT_PUBLIC_USE_MOCK` | `false` |
| `AUTH_REQUIRED` | `true` |
| `COLLECTOR_HOST_1` | `167.99.59.55` |
| `COLLECTOR_HOST_1_NAME` | `blackglass-rustdesk-demo` |
| `LAB_AGENT_HOST_ID` | `host-167-99-59-55` |
| `SHOWCASE_AUTO_PROVISION_DISABLED` | `true` |
| `DO_SPACES_BUCKET` | `blackglass-state` |
| `DO_SPACES_ENDPOINT` | `https://nyc3.digitaloceanspaces.com` |
| `BLACKGLASS_PLAN` | `enterprise` |
| `EMAIL_FROM` | `Blackglass <noreply@obsidiandynamics.co.uk>` |

Secrets (set in DO console only — **never commit**): `DATABASE_URL`, `REDIS_QUEUE_URL`, `RATE_LIMIT_REDIS_URL`, `SSH_PRIVATE_KEY`, `DO_SPACES_SECRET`, Clerk, Stripe, Sentry, Resend, ingest keys, `DO_API_TOKEN`, `AUTH_SESSION_SECRET`, etc.

Export full live spec before changes:

```bash
doctl apps spec get 526a574e-48c6-48a8-94ff-b64b93fa70df > live-blackglass-spec.yaml
```

---

## Droplets

| ID | Name | IP | Region | Size | Tags | Blackglass role |
|----|------|-----|--------|------|------|-----------------|
| `568869333` | `obsidian-github-runner` | `167.99.59.55` | nyc3 | s-2vcpu-4gb | `blackglass`, `rustdesk-demo` | **Sales demo + push-agent** (docs call it `blackglass-rustdesk-demo`) |
| `564711799` | `rustdesk-server` | `206.189.114.207` | lon1 | s-1vcpu-1gb | `rustdesk` | Screen-share relay for demos |
| `574766123` | `zero-hour-worker` | `188.166.170.255` | lon1 | s-1vcpu-1gb | — | **Review** — not tagged Blackglass; confirm before delete |

---

## Managed databases

**None in this DigitalOcean account** as of 2026-06-25.

The CI workflow still references cluster `4d063be8-1cc1-4b45-8b57-2a96a9c77161` — that ID is **not** present in this account (likely deleted or different account). Before reactivation:

1. Read `DATABASE_URL` from App Platform secrets (or Doppler backup).
2. Confirm the host is reachable (`psql` / `npm run db:migrate:status`).
3. If unreachable, restore from your last backup or provision a new cluster and restore dump.

Same for `REDIS_QUEUE_URL` / `RATE_LIMIT_REDIS_URL`.

---

## Spaces

| Field | Value |
|-------|-------|
| Bucket | `blackglass-state` |
| Endpoint | `https://nyc3.digitaloceanspaces.com` |
| Access key name (app env) | `DO80172CGCFTDZ7QND2N` — rotate if exposed |

Spaces access keys in account (names only): `blackglass-fullaccess` (multiple), `lethe-guard-app`.

---

## Firewalls

| ID | Name | Attached droplets |
|----|------|-------------------|
| `c0b538a0-577b-44be-bb36-f61ca617c2de` | `blackglass-lab-fw` | none |
| `939a06c4-3f53-4c01-a410-54e1943cc557` | `rustdesk-firewall` | `rustdesk-server` (564711799) |

---

## Account SSH keys

| ID | Name |
|----|------|
| `56040802` | `blackglass-collector-v2` |
| `56028631` | `blackglass-new` |

---

## DNS (DigitalOcean Domains)

Registered zones in account:

| Domain | In Blackglass project? |
|--------|------------------------|
| `blackglasssec.com` | Yes |
| `charongate.com` | No |
| `letheguard.com` | No |

`blackglasssec.com` zone in DO API shows **SOA/NS only** — apex records may live at **Cloudflare** or another DNS host while NS still points at DO. Export DNS from wherever you manage public records before mothballing.

App Platform custom domains: `blackglasssec.com`, `www.blackglasssec.com`.

---

## Mothball checklist (this account)

Already done:

- [x] App Platform app **archived** (503 on health)

Still billable / action needed:

- [ ] **Power off** droplets `568869333`, `564711799` (snapshot demo VM first)
- [ ] Decide fate of `574766123` (`zero-hour-worker`)
- [ ] **Disable deploy-on-push** on app (still enabled in spec)
- [ ] Export `live-blackglass-spec.yaml` + Doppler/DO secrets backup
- [ ] Confirm **Postgres/Redis** provider outside DO — export `pg_dump` if data still matters
- [ ] Spaces: sync `blackglass-state` offline if needed; bucket is cheap to keep
- [ ] **Rotate** any token or key shared in plaintext (PAT, Spaces, Stripe test keys in env)
- [ ] GitHub Actions: unset `DO_APP_ID` / `DO_API_TOKEN` or disable workflows

See [mothballing-digitalocean.md](./mothballing-digitalocean.md).

---

## Reactivation checklist (this account)

1. **Unarchive** App Platform app (DO console → Apps → blackglass → Restore / Unarchive).
2. Confirm **Postgres + Redis** URLs in secrets still work; recreate managed DBs if not.
3. Set `instance_count: 1` on `web` (and workers you need).
4. Consider adding **`scan-worker`** if you want SSH/BullMQ scans (missing from live spec).
5. Power on **`obsidian-github-runner`** (`167.99.59.55`); verify push-agent timer.
6. Redeploy; run `npm run db:migrate` via PRE_DEPLOY job.
7. Verify `https://blackglasssec.com/api/health` → 200.
8. Re-enable CI secrets: `DO_APP_ID=526a574e-48c6-48a8-94ff-b64b93fa70df`.

See [reactivating-digitalocean.md](./reactivating-digitalocean.md).

---

## Refresh this snapshot

```bash
export DIGITALOCEAN_ACCESS_TOKEN="dop_v1_..."   # never commit
npm run do:inventory
npm run do:inventory -- --json > ~/blackglass-do-inventory-$(date +%Y%m%d).json
doctl apps spec get 526a574e-48c6-48a8-94ff-b64b93fa70df > ~/live-blackglass-spec.yaml
```
