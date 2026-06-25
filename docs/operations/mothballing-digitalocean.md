# Mothballing Blackglass on DigitalOcean

Step-by-step guide to **safely pause** the Blackglass SaaS stack on DigitalOcean while preserving the ability to reactivate later. Pair with [digitalocean-product-inventory.md](./digitalocean-product-inventory.md) and [reactivating-digitalocean.md](./reactivating-digitalocean.md).

**Audience:** operator / founder shutting down active spend while keeping backups and configuration recoverable.

---

## Before you start (checklist)

Complete these **before** changing anything in production:

- [ ] **Export live inventory** — store offline (not in git):
  ```bash
  export DIGITALOCEAN_ACCESS_TOKEN="dop_v1_..."
  node scripts/do/inventory-do-resources.mjs --json > do-inventory-$(date +%Y%m%d).json
  doctl apps list -o json >> do-inventory-$(date +%Y%m%d).json  # optional append
  doctl apps spec get <production-app-id> > live-production-spec-$(date +%Y%m%d).yaml
  doctl apps spec get <staging-app-id> > live-staging-spec-$(date +%Y%m%d).yaml 2>/dev/null || true
  ```
- [ ] **Export secrets** — Doppler config dump, 1Password vault, Clerk/Stripe/Cloudflare credentials (see [vendor-inventory](../architecture/vendor-inventory.md)).
- [ ] **Confirm Postgres backups** — latest daily snapshot + PITR window ([backup-restore-drill.md](./backup-restore-drill.md)).
- [ ] **Optional final pg_dump** — belt-and-braces if you plan to destroy the cluster:
  ```bash
  pg_dump "$DATABASE_URL" -Fc -f blackglass-final-$(date +%Y%m%d).dump
  ```
- [ ] **Sync Spaces audit trail** — if compliance retention requires offline copy:
  ```bash
  aws --endpoint-url "$DO_SPACES_ENDPOINT" s3 sync \
    "s3://${DO_SPACES_BUCKET}/audit/" "./offline-audit-$(date +%Y%m%d)/"
  ```
- [ ] **Notify stakeholders** — status page, customers (if any live tenants), disable Stripe billing or cancel subscriptions.
- [ ] **Disable auto-deploy** — turn off GitHub → App Platform deploy-on-push (see Phase 2).

---

## Mothballing goals

| Goal | Approach |
|------|----------|
| Stop compute spend | Scale down / delete App Platform components; power off Droplets |
| Preserve tenant data | Keep Managed Postgres **or** snapshot + destroy (cheaper long-term) |
| Preserve object storage | Keep Spaces bucket (low cost) or sync + delete |
| Avoid surprise charges | Delete ephemeral sandbox Droplets; verify no orphaned firewalls/volumes |
| Enable reactivation | Save live app spec YAML, connection strings, DNS records, demo VM SSH access |

---

## Phase 1 — Stop user-facing traffic (edge)

DNS is **Cloudflare**, not DigitalOcean.

1. **Cloudflare** — set `staging.blackglasssec.com` and `app.blackglasssec.com` (or apex) to:
   - Maintenance page, **or**
   - `NEXT_PUBLIC_SITE_NOINDEX`-style static holding page on a minimal worker, **or**
   - Temporary 503 origin while App Platform is scaled down.
2. **Optional:** Pause Clerk application or set `AUTH_REQUIRED=false` on a static maintenance deploy only if you keep a minimal app alive.
3. **Stripe** — disable checkout webhooks or pause products so reactivation does not charge stale price IDs.

Document current DNS records (export from Cloudflare) and store with inventory JSON.

---

## Phase 2 — App Platform (largest compute line item)

### 2a. Disable deploy-on-push

In each App Platform app → **Settings → GitHub** → disable automatic deploys, **or** edit spec:

```yaml
github:
  deploy_on_push: false
```

Apply with `doctl apps update <app-id> --spec live-production-spec.yaml`.

This prevents CI (`ci.yml` deploy poll) from fighting your mothball state.

### 2b. Scale components to zero (preferred pause)

For each component (`web`, `scan-worker`, `ops-worker`, `sandbox-worker` if present):

```bash
# Inspect current spec
doctl apps spec get <app-id> -o yaml > /tmp/app-pause.yaml
# Edit instance_count: 0 for each service/worker (jobs can remain or be removed)
doctl apps update <app-id> --spec /tmp/app-pause.yaml
```

**Alternative — delete workers only, keep web at 0:**

Removing worker components from the spec stops BullMQ consumers; queued jobs remain in Redis until TTL (ephemeral).

### 2c. Full App delete (maximum savings, harder reactivation)

```bash
doctl apps delete <app-id>   # irreversible for that app ID; keep exported spec YAML
```

Only do this **after** exporting `live-production-spec-*.yaml` and confirming Postgres/Spaces are independent.

### 2d. GitHub Actions

Disable or skip workflows that assume a live app:

- `.github/workflows/ci.yml` — DO deploy poll (fails harmlessly if secrets unset)
- `.github/workflows/staging-smoke.yml`
- `.github/workflows/maintenance.yml` — prune jobs need `DATABASE_URL` / Spaces

Repository → **Actions** → disable selected workflows, or remove `DO_APP_ID` / `DO_API_TOKEN` secrets temporarily (document which you removed).

---

## Phase 3 — Background workers & queues

| Component | Mothball action |
|-----------|-----------------|
| **scan-worker** | Scale to 0 or remove from spec |
| **ops-worker** | Scale to 0 or remove (webhooks, Charon, retention stop) |
| **sandbox-worker** | Scale to 0 or remove |
| **Managed Valkey** | Optional destroy after App Platform stopped — **queue state is ephemeral** |
| **db-migrate job** | Safe to leave; won't run without deploys |

If destroying Valkey:

```bash
doctl databases list
doctl databases delete <valkey-cluster-id>
```

Save the old `REDIS_QUEUE_URL` in secrets archive (needed only if you recreate with same app config).

---

## Phase 4 — Droplets & sandboxes

### 4a. Ephemeral sandboxes (tag `blackglass-sandbox`)

List and destroy leftovers (public showcase was retired; stragglers may remain):

```bash
doctl compute droplet list --tag-name blackglass-sandbox
doctl compute droplet delete <id> --force
```

Orphan firewalls created by `sandbox-provisioner.ts`:

```bash
doctl compute firewall list
# Delete any named like blackglass-sandbox-* with no attached droplets
doctl compute firewall delete <id>
```

Ensure App env has `SHOWCASE_AUTO_PROVISION_DISABLED=true` (already retired in prod per runbook §4b).

### 4b. Sales-demo VM (`blackglass-rustdesk-demo`, 167.99.59.55)

**Recommended:** **Power off**, do not delete — reactivation needs this host for live demos.

```bash
doctl compute droplet list | grep -E 'rustdesk|blackglass'
doctl compute droplet-action power-off <demo-droplet-id>
```

Before power-off, note:

- Root/`blackglass` SSH access and key location
- `/etc/blackglass-agent.env` on the VM
- `scripts/systemd/blackglass-agent.timer` status

Optional snapshot (small cost, fast restore):

```bash
doctl compute droplet-action snapshot <demo-droplet-id> --snapshot-name blackglass-demo-mothball-$(date +%Y%m%d)
```

### 4c. RustDesk relay (`rustdesk-server`, 206.189.114.207)

Power off if demos are fully paused:

```bash
doctl compute droplet-action power-off <relay-droplet-id>
```

---

## Phase 5 — Data plane

### Managed PostgreSQL

| Strategy | Cost | Reactivation effort |
|----------|------|---------------------|
| **Keep cluster running** | Highest | Lowest — point app back at same `DATABASE_URL` |
| **Snapshot then destroy** | Lowest long-term | Restore to new cluster from snapshot ([reactivating guide](./reactivating-digitalocean.md)) |
| **PITR only (keep cluster paused)** | N/A — DO doesn't "pause" DB | Must keep cluster or snapshot |

For mothball with **keep data, reduce risk**:

1. Verify latest backup in DO console → **Databases → Backups**.
2. Optional: create manual backup / fork to cheap staging cluster for drill.
3. If destroying: run final `pg_dump` (see checklist) **then** delete cluster in console.

CI cluster ID referenced in repo: `4d063be8-1cc1-4b45-8b57-2a96a9c77161` — confirm this still matches live before delete.

### Spaces

| Strategy | Notes |
|----------|-------|
| **Keep bucket** | Pennies–dollars/month for modest data; versioning protects audit JSONL |
| **Sync offline + delete bucket** | Use only if retention policy allows; export audit first |

Disable lifecycle deletes if you need indefinite retention during mothball.

### Block volumes

If attached to App Platform or a Droplet:

```bash
doctl compute volume list
# Detach, snapshot, then delete if unused
```

---

## Phase 6 — Secrets & tokens

Rotate or revoke to reduce blast radius while mothballed:

| Secret | Action |
|--------|--------|
| `DO_API_TOKEN` (operator) | Revoke in DO → API → Tokens; store old token label in inventory notes |
| `DO_SPACES_*` keys | Rotate in Spaces settings if token was exposed (showcase recovery note in `canvases/outstanding-actions.canvas.tsx`) |
| Doppler → DO sync | Disable integration to prevent accidental redeploy |
| Clerk / Stripe | Keep for reactivation or export config; disable webhooks pointing at dead URLs |
| Demo VM `INGEST_*` keys | Document values; rotate on reactivation |

**Never commit** exported specs or inventory JSON containing secrets.

---

## Phase 7 — Terraform (if used)

If you previously applied `terraform/digitalocean/`:

```bash
cd terraform/digitalocean
terraform plan -destroy   # review billable resources
# Only when sure:
terraform destroy -var="create_managed_postgres=true" -var="create_managed_valkey=true"
```

Default module has `create_managed_* = false`; many environments never used Terraform.

---

## Phase 8 — Verify mothball complete

Run inventory again — expect minimal running resources:

```bash
node scripts/do/inventory-do-resources.mjs
```

Manual checks:

- [ ] `https://app.blackglasssec.com/api/health` unreachable or maintenance (expected)
- [ ] No `blackglass-sandbox` Droplets running
- [ ] App Platform app absent or all `instance_count: 0`
- [ ] Postgres strategy documented (kept vs snapshot ID vs destroyed)
- [ ] Offline bundle stored: inventory JSON, live spec YAML, DNS export, secrets backup, optional pg_dump

---

## Suggested mothball order (summary)

1. Export inventory + live specs + secrets  
2. Cloudflare → maintenance / stop traffic  
3. Disable deploy-on-push  
4. Scale App Platform to 0 (or delete app)  
5. Stop/delete workers; optional destroy Valkey  
6. Destroy sandbox Droplets + orphan firewalls  
7. Power off demo + relay Droplets (snapshot first)  
8. Decide Postgres + Spaces retention  
9. Revoke/rotate API tokens  
10. Disable CI workflows that touch production  

---

## Related docs

- [Reactivating DigitalOcean](./reactivating-digitalocean.md)
- [Backup & restore drill](./backup-restore-drill.md)
- [Operations runbook §4b–4c](../runbooks/operations.md) — showcase retirement + sales-demo VM
- [Sales demo walkthrough](../marketing/sales-demo-walkthrough.md)
