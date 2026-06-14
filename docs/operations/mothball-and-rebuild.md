# Mothball & rebuild — Blackglass databases

This runbook covers how to safely pause the production DigitalOcean managed
databases to stop billing while keeping everything needed to bring them back
in minutes.

**"Moth-balling" means:**
- Capture the full cluster configuration.
- Take a DO managed backup snapshot (automatic).
- Run a `pg_dump` to DigitalOcean Spaces as a durable portable copy.
- Delete the clusters so billing stops.
- Leave a `mothball-config.json` that drives a one-command rebuild.

The application code, schema migrations, and rebuild scripts remain in the
repo so you can be back to a running database from scratch in under 15 minutes.

---

## When to use this

| Scenario | Action |
|----------|--------|
| Taking a long development pause (> 1 month) | Full mothball + destroy |
| Cost reduction during beta | Mothball + destroy |
| Rebuilding from scratch for a fresh deployment | rebuild-databases.ps1 |
| Quarterly DR drill | Follow backup-restore-drill.md instead |

---

## Pre-mothball checklist

- [ ] All active customers / tenants have been notified (if applicable).
- [ ] Confirm the latest automated backup exists: `doctl databases backups list 4d063be8-1cc1-4b45-8b57-2a96a9c77161`
- [ ] Confirm `DO_SPACES_*` env vars are set (for the pg_dump upload).
- [ ] Confirm `DATABASE_URL` points at production (for the pg_dump).
- [ ] `pg_dump` is on PATH (`pg_dump --version`).
- [ ] App Platform app is either suspended or pointing at a mock/maintenance page.
- [ ] Store the resulting `mothball-config.json` in 1Password under "Blackglass ops".

---

## Mothball procedure

### Option A — full mothball + destroy (stops billing)

```powershell
# Set your DO token
$env:DIGITALOCEAN_ACCESS_TOKEN = "dop_v1_..."
# Set database connection for pg_dump
$env:DATABASE_URL = "postgresql://..."     # production, port 25060
# Set Spaces credentials for the dump upload
$env:DO_SPACES_ENDPOINT = "https://lon1.digitaloceanspaces.com"
$env:DO_SPACES_BUCKET   = "blackglass-prod-evidence"
$env:DO_SPACES_KEY      = "..."
$env:DO_SPACES_SECRET   = "..."

# Run the mothball (captures config + runs pg_dump, then asks for confirmation before destroy)
.\scripts\do\mothball-databases.ps1 -Destroy
```

The script will:
1. Fetch and display both cluster configs (Postgres + Valkey).
2. List the most recent DO managed backup.
3. Run `npm run db:backup` to pg_dump → Spaces.
4. Write `scripts/do/mothball-config.json`.
5. Ask you to type `mothball` to confirm deletion.
6. Delete both clusters.

### Option B — capture + dump only (keep clusters running)

```powershell
.\scripts\do\mothball-databases.ps1
# No -Destroy flag — clusters stay live, you just get the config + pg_dump
```

### Option C — skip pg_dump (no postgres-client on this machine)

```powershell
.\scripts\do\mothball-databases.ps1 -SkipDump -Destroy
# Make sure you have another backup before using -SkipDump!
```

### Specifying cluster IDs explicitly

The Postgres cluster ID defaults to the production value
`4d063be8-1cc1-4b45-8b57-2a96a9c77161` (from `db-migrate.yml`).
The Valkey cluster ID is auto-discovered via the `blackglass` tag, or:

```powershell
.\scripts\do\mothball-databases.ps1 `
    -PostgresClusterId "4d063be8-1cc1-4b45-8b57-2a96a9c77161" `
    -ValKeyClusterId   "YOUR-REDIS-CLUSTER-UUID"
```

---

## After mothball — what to store

`scripts/do/mothball-config.json` is **gitignored** (contains cluster IDs and
backup references). Store it securely:

1. Copy to **1Password** → vault `Blackglass` → item `DB mothball config <date>`.
2. The file records the pg_dump Spaces key so you can re-download it later.
3. DO managed snapshots expire **7 days after cluster deletion** — the Spaces
   pg_dump is the only indefinitely durable backup.

---

## Rebuild procedure

### Prerequisites

- `mothball-config.json` available locally (copy from 1Password).
- DO token with database write permission.
- (Optional) `$env:BLACKGLASS_APP_ID` for auto-firewall wiring.

### Step 1 — recreate clusters

```powershell
$env:DIGITALOCEAN_ACCESS_TOKEN = "dop_v1_..."
$env:BLACKGLASS_APP_ID         = "526a574e-..."   # your App Platform app UUID

.\scripts\do\rebuild-databases.ps1 -Config scripts/do/mothball-config.json
```

The script will:
1. Create the Postgres cluster (same region/size/version as mothball config).
2. Create the logical database and app user inside the cluster.
3. Create the Valkey cluster.
4. Wait for both to reach "online" status (~2–5 min).
5. Add the App Platform as a trusted firewall source.
6. Update `.github/workflows/db-migrate.yml` with the new cluster ID.
7. Print exact next-step commands.

### Step 2 — update secrets

Copy the new connection URIs from the DO console (or `doctl databases get <id>`)
and update them in **Doppler** (production config):

| Secret | Value |
|--------|-------|
| `DATABASE_URL` | new Postgres URI, **port 25060** (direct, not pgBouncer) |
| `RATE_LIMIT_REDIS_URL` | new Valkey URI |
| `REDIS_QUEUE_URL` | same Valkey URI |

Then sync to App Platform:
```bash
doppler secrets download --no-file --format env > .env.prod.tmp
doctl apps update <APP_ID> --spec .do/app-git.production.yaml
# Remove .env.prod.tmp immediately after
```

### Step 3 — run migrations

```bash
# Use port 25060 (direct Postgres) — migrations need ALTER TYPE support
DATABASE_URL="postgresql://...@...:25060/blackglass?sslmode=require" \
  npm run db:migrate

# Or trigger via GitHub Actions:
gh workflow run db-migrate.yml -f mode=apply
```

### Step 4 — restore data (if fresh cluster)

If you did NOT use DO PITR (restoring into the same cluster UUID),
restore from the pg_dump:

```bash
# Download the dump from Spaces
aws --endpoint-url https://lon1.digitaloceanspaces.com \
  s3 cp s3://<BUCKET>/<spacesKey from mothball-config.json> restore.sql.gz

gunzip restore.sql.gz

# Restore (doadmin password from DO console)
PGPASSWORD=<doadmin-pass> psql \
  "postgresql://doadmin@<host>:25060/blackglass?sslmode=require" \
  -f restore.sql

# Re-run migrations to apply any schema changes made after the dump
npm run db:migrate
```

### Step 5 — verify

```bash
node scripts/ops/verify-partition-integrity.mjs

# App health (after deploying)
curl https://blackglasssec.com/api/health
```

---

## Terraform alternative (IaC rebuild)

If you prefer Terraform over the PowerShell scripts:

```bash
cd terraform/digitalocean

export TF_VAR_do_token="dop_v1_..."

terraform init
terraform plan \
  -var="create_managed_postgres=true" \
  -var="create_managed_valkey=true" \
  -var="app_platform_app_id=<your-app-id>"

terraform apply \
  -var="create_managed_postgres=true" \
  -var="create_managed_valkey=true" \
  -var="app_platform_app_id=<your-app-id>"

# Retrieve the sensitive URIs:
terraform output -json postgres_uri
terraform output -json valkey_uri
terraform output postgres_cluster_id
```

Variables default to the production values (`lon1`, `db-s-1vcpu-1gb`,
`blackglass-pg`, `blackglass-redis`) so no additional flags are needed
beyond enabling the resources.

---

## Quick reference

| Script | Purpose |
|--------|---------|
| `scripts/do/mothball-databases.ps1` | Capture + dump + optionally destroy clusters |
| `scripts/do/rebuild-databases.ps1` | Recreate clusters from mothball-config.json |
| `scripts/ops/backup-postgres.mjs` | Standalone pg_dump → DO Spaces |
| `npm run db:backup` | pg_dump shortcut |
| `npm run do:mothball` | Capture + dump (no destroy) |
| `npm run db:migrate` | Apply Drizzle migrations to DATABASE_URL |
| `scripts/ops/verify-partition-integrity.mjs` | Post-restore DB health check |

| Key identifier | Value |
|----------------|-------|
| Production Postgres cluster ID | `4d063be8-1cc1-4b45-8b57-2a96a9c77161` |
| App Platform region | `lon` (App Platform) / `lon1` (databases) |
| Default DB size | `db-s-1vcpu-1gb` |
| DO Postgres migration port | **25060** (direct) — NOT 25061 (pgBouncer) |
| DO managed backup window | 7 days PITR, retained 7 days after cluster delete |
| pg_dump Spaces path | `backups/postgres/production/<timestamp>.sql.gz` |

---

## Billing notes

| Resource | Monthly cost (db-s-1vcpu-1gb, lon1, 2026) |
|----------|-------------------------------------------|
| DO Managed Postgres | ~$15 USD |
| DO Managed Valkey | ~$15 USD |
| DO Spaces storage | ~$0.02/GB/month (negligible for pg_dumps) |

Deleting both clusters saves ~$30/month. Recreating from scratch (Step 1–5
above) takes under 15 minutes once you have the secrets ready.
