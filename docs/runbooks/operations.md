# BLACKGLASS — Operations Runbook (DR + Queues + DLQ)

> Version: 1.0 · Last reviewed: 2026-05-07
> Audience: on-call operators, SRE, DR drill participants.

This runbook answers two recurring questions:

1. **"What happens when X breaks?"** — see § 1 (Queues) and § 2 (DLQs).
2. **"How do we recover?"** — see § 3 (Backup & Restore) and § 4
   (Restore Drill).

If you are paging in for the first time, jump to § 5 (One-page on-call
checklist) at the bottom.

---

## 1. Queues — what's normal, what's degraded

BLACKGLASS uses BullMQ over Redis. Every queue is configured in
`src/lib/server/queue/config.ts` — that file is the source of truth for
names, retry counts, backoff, and retention.

| Queue                        | What it does                                                     | Attempts | Backoff (exp.)        | Concurrency / worker | Retention (failed) |
| ---------------------------- | ---------------------------------------------------------------- | -------- | --------------------- | -------------------- | ------------------ |
| `blackglass-scans`           | SSH collection + drift compute (`scan-worker`)                   | 3        | 2 s base              | RAM-capped, ≤ 32     | 100 jobs           |
| `blackglass-sandbox`         | Sandbox provision / seed-drift / cleanup (`sandbox-worker`)      | 5/3/10   | 5 s / 10 s / 30 s     | 2                    | 50 jobs            |
| `blackglass-webhooks`        | Outbound webhook delivery (`ops-worker`)                         | 6        | 5 s base              | 8                    | 200 jobs (DLQ)     |
| `blackglass-exports`         | Tenant data-export bundle assembly + Spaces upload (`ops-worker`)| 3        | 30 s base             | 2                    | 50 jobs            |
| `blackglass-maintenance`     | Retention sweep + drift digest + partition maintenance + idempotency pruning (`ops-worker`) | 1   | n/a                   | 1                    | 20 jobs            |
| _Reserved (no worker yet):_  | _`blackglass-reports`, `blackglass-evidence` — names defined in `queue/config.ts` for future async generation. PDF/evidence generation currently runs inline in the API handler._ | – | – | – | – |

The maintenance queue multiplexes three repeatable jobs onto one
worker. The full schedule is:

| Sub-job (payload `type`)  | Cadence                                    | Env override                            | Source                                            |
| ------------------------- | ------------------------------------------ | --------------------------------------- | ------------------------------------------------- |
| `retention-sweep`         | every 24 h                                 | `RETENTION_SWEEP_HOURS`                 | `services/retention-service.ts`                   |
| `drift-digest`            | every 24 h (Daily) / 168 h (Weekly) / off  | `DRIFT_DIGEST_INTERVAL` (deployment) + per-tenant `drift_digest_cadence='off'` opt-out | `services/drift-digest-service.ts` |
| `partition-maintenance`   | every 1 h                                  | `MAINTENANCE_PARTITION_EVERY_HOURS`     | `services/partition-maintenance-service.ts`       |

`partition-maintenance` calls
`ensureUpcomingDriftPartitions()` which is idempotent — if the next
two months of `drift_events` partitions already exist it's a no-op.
Lookahead window is `MAINTENANCE_PARTITION_LOOKAHEAD_MONTHS` (default
2). A failure on a single month doesn't abort the others (savepoint
per month), so a transient race condition leaves the queue eventually
self-healing on the next tick.

### Healthy steady state

- **Scans:** Less than 30 s end-to-end per host on a happy SSH connection.
  Active jobs ≤ concurrency cap; failed-job count not climbing.
- **Webhooks:** Delivery latency < 5 s. The "Failed" tab in the queue
  dashboard should be empty under normal operation; transient 5xx
  retries are normal but should drain within a minute.
- **Sandbox:** Provision → seed-drift → cleanup all complete within
  ~10 minutes per remediation. Stale Droplets are caught by the
  cleanup queue's high attempt count (10) — see § 2.4.
- **Exports:** I/O bound — typical job is 5–60 s.

### Degradation signals (page on-call when any of these flip)

- `failed_jobs_total{queue="blackglass-webhooks"} > 50` — receiver is
  down or signing key is wrong.
- `failed_jobs_total{queue="blackglass-sandbox"} > 10` — DigitalOcean API
  outage or quota exhausted.
- `wait_jobs_total{queue="blackglass-scans"} > 100` for > 5 minutes —
  workers are stuck or under-provisioned.
- `redis_connected_clients < expected_worker_count` — workers crashed
  and didn't reconnect.

---

## 2. Dead-Letter Queues (DLQs)

BullMQ doesn't expose a literal "DLQ" — instead, jobs that exhaust their
retry budget land in the `failed` set on the same queue. The retention
counts above (the rightmost column) are sized so that the most recent
failures stay visible long enough for an operator to triage. The
`/queues` admin route surfaces these.

### 2.1 Webhook DLQ (most common)

**Symptom:** Receiver returned 4xx or non-2xx after 6 attempts (~10
minutes of exponential backoff).

**What's stored:** Full job payload, target URL, attempt count, last
HTTP status code, response body (first 1 KB).

**Triage:**

1. Open the failed job in the queues UI or via:
   ```sh
   redis-cli -u $REDIS_QUEUE_URL ZRANGE bull:blackglass-webhooks:failed 0 10 WITHSCORES
   ```
2. Inspect the response body. Common causes:
   - **401/403:** Customer rotated the receiver's secret. Tell them to
     update it via Settings → Webhook Signing Key.
   - **404:** Customer deleted or moved the receiver. Disable the
     destination in Settings → Notifications.
   - **413:** Payload too large — usually a fleet-wide drift event with
     hundreds of findings. Increase the receiver's body limit, or
     enable the per-finding split mode (env `WEBHOOK_SPLIT_FINDINGS=true`).
   - **5xx persistent:** Receiver is down. Mute their destination and
     re-enable when they confirm recovery.
3. Once the underlying cause is fixed, retry the job:
   ```sh
   curl -X POST $APP_URL/api/v1/admin/queues/blackglass-webhooks/jobs/<jobId>/retry \
        -H "Authorization: Bearer $ADMIN_API_KEY"
   ```

### 2.2 Scan DLQ

**Symptom:** SSH collection failed 3 times.

**Triage:**

1. Inspect the error in the failed job. SSH-level errors (`ETIMEDOUT`,
   `ECONNREFUSED`, `auth failed`) point at the host or the credential.
2. Use the **Diagnose** button in the host detail page — it runs a
   single-shot SSH probe with verbose output.
3. If the credential rotated, update Settings → Tenant Credentials and
   re-enqueue:
   ```sh
   curl -X POST $APP_URL/api/v1/scans -d '{"hostId":"<id>"}' \
        -H "Authorization: Bearer $OPERATOR_API_KEY"
   ```

### 2.3 Sandbox DLQ

**Symptom:** Droplet provision / seed / cleanup failed after retries.

**Triage:**

1. Provision failures (5 attempts) — usually DigitalOcean API rate-limit
   or quota. Check the DO dashboard.
2. Cleanup failures (10 attempts) — orphaned Droplet. Run:
   ```sh
   doctl compute droplet list --tag-name blackglass-sandbox
   doctl compute droplet delete <id>
   ```
   Then audit how many remediations are stuck in `AWAITING_VERIFICATION`
   and re-enqueue them.

### 2.4 Maintenance DLQ

**Symptom:** Single-attempt jobs fail and don't retry (by design).

**Triage:** Maintenance jobs run on a repeating schedule (every 1 h to
24 h depending on sub-job), so a single failure self-heals on the next
tick. **Page only if the same job class fails more than 3 ticks in a
row** — that indicates a code bug, not a transient blip.

`partition-maintenance` failures get **special priority** because a
missed monthly partition causes inserts to land in
`drift_events_default` (slow drops, broken query plans) or to fail
outright if `drift_events_default` is missing. If you see
`partition_maintenance_completed errorCount > 0` for two ticks in a
row, drop everything and read the error column — the most common
cause is missing CREATE permission on the role used by `withBypassRls`
(e.g. someone tightened the role to `INSERT,UPDATE,DELETE` only).

---

## 3. Backup & Restore

### 3.1 What is backed up

| Datastore                | Mechanism                                | Cadence      | Retention |
| ------------------------ | ---------------------------------------- | ------------ | --------- |
| Postgres (managed DO)    | Automated snapshot                       | Daily 03:00 UTC | 7 days    |
| Postgres (manual)        | `pg_dump` (compressed) → Spaces           | Weekly Sunday | 90 days   |
| Spaces (object storage)  | Object versioning + lifecycle to cold tier | Continuous   | 365 days  |
| Helm chart values        | Stored in customer's Vault / GitHub repo  | Per change   | Forever   |
| `.env` / DO App Spec     | Doppler config audit log                 | Per change   | Forever   |

The weekly `pg_dump` is owned by `scripts/ops/backup-postgres.mjs`
(scheduled in DO App Platform). It writes to:

```
s3://blackglass-backups/postgres/<env>/<YYYY-MM-DD>.sql.gz
```

### 3.2 What is NOT backed up (and why)

- **Redis (BullMQ queues).** Queues are in-flight work; rebuilding from
  Postgres is faster than restoring a Redis snapshot. Loss of Redis at
  most loses the in-progress jobs, which `scan-worker` re-enqueues on
  the next scheduled run.
- **Sentry events.** Sentry has its own retention; we don't shadow them.
- **OpenTelemetry traces.** Same — handled by the configured backend.

### 3.3 Restore — Postgres into staging

```bash
# 1. Provision a fresh staging DB cluster
doctl databases create blackglass-staging-restore --engine pg --version 16 --region nyc1 --size db-s-1vcpu-1gb

# 2. Pull the latest backup from Spaces
aws s3 cp \
  s3://blackglass-backups/postgres/prod/$(date +%Y-%m-%d).sql.gz \
  ./restore.sql.gz \
  --endpoint-url $DO_SPACES_ENDPOINT

# 3. Restore into the new cluster
gunzip -c ./restore.sql.gz | psql $STAGING_DB_URL

# 4. Run the partition integrity check
DATABASE_URL=$STAGING_DB_URL node scripts/ops/verify-partition-integrity.mjs

# 5. Spot-check tenant counts
psql $STAGING_DB_URL -c "SELECT count(*) FROM saas_tenants"
psql $STAGING_DB_URL -c "SELECT count(*) FROM drift_events"
```

**SLO for restore:** Cold restore of a 30 GB Postgres backup completes
in **< 60 minutes**. RPO = 24 h (last automated snapshot) or 7 days
(weekly `pg_dump`), RTO = 60 minutes for the staging restore + 15
minutes to flip DNS for a full failover.

### 3.4 Restore — Spaces objects

Spaces has versioning enabled. To restore a deleted or overwritten
object:

```bash
# List versions of a single object
aws s3api list-object-versions --bucket blackglass-prod \
    --prefix evidence/<tenant>/<bundle-id>.zip \
    --endpoint-url $DO_SPACES_ENDPOINT

# Copy a specific version back to head
aws s3api copy-object --bucket blackglass-prod \
    --copy-source "blackglass-prod/evidence/<tenant>/<bundle-id>.zip?versionId=<id>" \
    --key evidence/<tenant>/<bundle-id>.zip \
    --endpoint-url $DO_SPACES_ENDPOINT
```

---

## 4. Restore Drill (quarterly)

Run this drill **once per quarter**. The output (timing + any failed
checks) is filed under `docs/runbooks/drills/<YYYY-Q?>.md`.

1. **Provision** a fresh staging cluster (§ 3.3 step 1).
2. **Restore** the latest backup (§ 3.3 steps 2-3).
3. **Run partition integrity:** `node scripts/ops/verify-partition-integrity.mjs`.
4. **Spot-check:** confirm the tenant count + most recent drift event timestamp matches production within 24 h.
5. **App smoke test:** point a staging deployment at the restored DB,
   sign in as a test tenant, run a scan, confirm drift events land.
6. **Tear down** the restored cluster.
7. **File the drill report** with timings and any deviations from this runbook.

**Pass criteria:**

- Restore completes in < 60 minutes.
- Partition integrity script exits 0.
- App smoke test passes (scan → drift → audit row chain works).

---

## 4a. Schema migrations (Drizzle)

Migrations live in `drizzle/NNNN_*.sql` (4-digit zero-padded prefix, strictly
monotonic). They are applied by `scripts/ops/apply-migrations.mjs`, which
records every applied file's sha256 hash in `drizzle.__drizzle_migrations`
so re-runs are no-ops.

### npm scripts

| Script                      | Effect                                                            |
| --------------------------- | ----------------------------------------------------------------- |
| `npm run db:migrate`        | Apply all pending migrations (default — what you want most days). |
| `npm run db:migrate:check`  | Dry-run; exits 1 if anything is pending. Used in CI.              |
| `npm run db:migrate:status` | Print applied vs. pending list and exit 0.                        |
| `npm run db:migrate:files`  | Static check (no DB) — file ordering, gaps, duplicates.           |

The static check (`db:migrate:files`) runs in `verify:stage0` on every
commit. The end-to-end check (boot ephemeral Postgres, apply all
migrations, verify nothing pending, verify re-run is a no-op) runs as the
`migrations-end-to-end` job in `.github/workflows/ci.yml`.

### Production runs

Use the `Apply database migrations` workflow in GitHub Actions
(`.github/workflows/db-migrate.yml`):

1. Actions → "Apply database migrations" → "Run workflow".
2. Pick the mode:
   - **`check`** (default): dry-run. Tells you what's pending without
     applying anything. **Always run this first.**
   - **`apply`**: runs the migrator. Each migration runs inside a
     transaction; failure rolls back and the workflow exits 1.
   - **`baseline`**: marks every file as applied without running the SQL.
     **Only use this when adopting a database whose schema was applied by
     hand**, e.g. the recovery path used after the 2026-05-07 incident.
   - **`status`**: print the bookkeeping table contents and exit 0.

The workflow opens the DO managed-DB firewall to the GitHub runner IP for
the duration of the run, then closes it again on exit (in an `if: always`
block, so it runs even on failure).

### When `db:migrate:check` reports drift

```text
SCHEMA DRIFT: 2 migration(s) not applied:
  • 0014_some_thing.sql
  • 0015_some_other.sql
```

1. Read the SQL files. Confirm they're idempotent (every prod migration
   should use `IF NOT EXISTS` / `ON CONFLICT`). If not, push a fix first.
2. Run the workflow with **`mode=apply`**.
3. Re-run with **`mode=check`** to confirm 0 pending.
4. Hit `https://blackglasssec.com/api/health` to confirm the app still
   responds; check the dashboard for affected features.

### Schema drift incident — 2026-05-07 (post-mortem reference)

**What happened:** The "Showcase VM offline" symptom traced to six
production migrations (`0008`–`0013`) that had been applied by hand at
some earlier point but never recorded in `drizzle.__drizzle_migrations`.
Several customer-facing features (api keys, remediations, drift mutes,
retention, exports, CIS evidence, tenant notifications, rotated webhook
keys) were silently broken because the application schema referenced
columns and tables the database lacked.

**Root cause:** The pre-existing manual migration workflow
(`db-migrate.yml`) shelled out to per-migration scripts (`_apply-0001`,
`_apply-0002`) without bookkeeping. Whoever applied later migrations
ran them by hand and never updated the workflow.

**Fix shipped (Wave 11):**

- Replaced the per-migration scripts with `apply-migrations.mjs`
  (hash-tracked, idempotent).
- Added `db:migrate:files` (static) to `verify:stage0`.
- Added `migrations-end-to-end` CI job that boots fresh Postgres, applies
  all migrations, verifies idempotency.
- Added the `mode=baseline` recovery path so this kind of drift is
  recoverable (mark current state as the baseline) instead of requiring
  manual SQL.
- This runbook section.

**Detection signal going forward:**
`db:migrate:files` fails the PR if anyone adds a SQL file out of order or
with a duplicate hash. `migrations-end-to-end` fails if any SQL file is
broken or assumes state that other files don't establish. Combined with
the `mode=check` workflow being a one-click sanity check, this class of
drift should not be able to silently land in production again.

---

## 4b. Public showcase sandbox — RETIRED

> **Status: retired on 2026-05-07.** The public auto-provisioning sandbox
> (per-visitor ephemeral Droplets that were SSH-scanned by the platform)
> was a high-cost, high-complexity feature for marginal commercial value.
> It is now disabled in production via `SHOWCASE_AUTO_PROVISION_DISABLED=true`,
> and `/demo/sandbox` is a static walkthrough page.
>
> The dedicated long-lived **sales-demo VM** (`blackglass-lab-01`) replaced
> it as the primary live-host story for prospect calls — see § 4c.

### What is still in the codebase

The sandbox subsystem (`src/lib/server/services/sandbox-provisioner.ts`,
`sandbox-worker.ts`, `/api/health/showcase`, `/api/admin/showcase`,
`/api/public/sandbox-showcase`, `ShowcaseOpsTile`) remains in the tree so
the public showcase can be re-enabled in another region or for a customer
PoC. With `SHOWCASE_AUTO_PROVISION_DISABLED=true` the API short-circuits
to `{status: "retired", sandbox: null, recentEvents: []}` and the
provisioner refuses to create new Droplets.

### Health probe

`GET https://blackglasssec.com/api/health/showcase` always returns HTTP 200
with a JSON body and `X-Showcase-Status` header. Monitor on the body
`status` field (and the header for cheap probes), not the HTTP code:

| `status` value | Meaning                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `disabled`     | `SANDBOX_SHOWCASE_TENANT_ID` is unset OR `SHOWCASE_AUTO_PROVISION_DISABLED=true`. **Expected in production today.** |
| `ok`           | Re-enabled and a sandbox is `ready` or `seeding` within TTL.           |
| `no_sandbox`   | Re-enabled, tenant exists, no sandbox row — auto-provision will retry. |
| `provisioning` | Re-enabled, sandbox row exists, no Droplet yet.                        |
| `expired`      | Re-enabled, TTL elapsed, sandbox-worker would normally recycle.        |
| `error`        | Re-enabled, `sandbox.status='error'` — `errorMessage` has details.     |
| `db_unavailable`| DB query failed. Likely Postgres outage.                              |

### Re-enabling

1. Unset (or set to `false`) `SHOWCASE_AUTO_PROVISION_DISABLED` in the DO
   App Platform env.
2. Confirm `SANDBOX_SHOWCASE_TENANT_ID`, `DO_API_TOKEN`,
   `DO_SANDBOX_FIREWALL_ID`, and the showcase SSH keypair env vars are
   still present.
3. Force a redeploy.
4. Confirm `GET /api/health/showcase` body status flips from `disabled`
   to `no_sandbox` → `provisioning` → `ok`.

### Recovery scripts

The historical bootstrap / inspect / reset helpers under
`scripts/ops/_*-showcase*.mjs` were removed when the public sandbox
was retired (see commit history). If you ever need to re-enable the
showcase, restore them from git or rebuild equivalents:

- Idempotent insert of the showcase `saas_tenants` row.
- Diagnostic dump of tenant + sandbox + audit rows.
- Mark stuck sandbox rows as `destroyed` so the route can re-provision.

Open the DO DB firewall to your IP first, run, then close it again.

---

## 4c. Long-lived sales-demo VM (`blackglass-lab-01`)

The primary live-host story for prospect calls is a long-lived demo VM
provisioned and maintained out of band. It is **not** auto-managed by the
console.

| Property              | Value                                                |
| --------------------- | ---------------------------------------------------- |
| Hostname              | `blackglass-lab-01`                                  |
| IP                    | `134.209.180.255`                                    |
| Region                | `lon1`                                               |
| OS                    | Ubuntu 22.04                                         |
| SSH access            | `root` and `blackglass` users (collector + personal keys via cloud-init) |
| `blackglass` shell    | `/bin/bash`                                          |
| `blackglass` sudoers  | NOPASSWD on read-only audit commands + the seed script (`/etc/sudoers.d/blackglass-scan`) |
| Firewall (Droplet)    | `ufw` enabled, port 22 only                          |
| Firewall (DO Cloud)   | `blackglass-lab-fw` attached                         |
| Provisioning script   | `scripts/create-do-droplet.ps1`                      |
| Wired into the app via| `COLLECTOR_HOST_1` env var on App Platform → points to this IP |

For demos: scan from the dashboard, walk through drift, propose a
remediation, approve it. The remediator's sandbox-verification path runs
against an ephemeral Droplet provisioned from the same `sandbox-provisioner`
codepath (see § 4b — re-enable the sandbox subsystem if you need this).

The canonical script for prospect demos lives at
[`docs/sales-demo-walkthrough.md`](../sales-demo-walkthrough.md). It
includes a deterministic seed-and-reset workflow:

```bash
# Before the call (one-time per demo cycle)
ssh root@134.209.180.255 'bash -s' < scripts/lab/reset-drift.sh
# Capture a fresh baseline from the BLACKGLASS console.
ssh root@134.209.180.255 'bash -s' < scripts/lab/seed-drift.sh

# After the call
ssh root@134.209.180.255 'bash -s' < scripts/lab/reset-drift.sh
```

The seed script stages four findings (one per remediator risk tier:
`safe_guidance_only` / `sandbox_verified` / `approval_required` /
`manual_only`) so the demo can hit every part of the safety story
without improvisation.

---

## 5. One-page on-call checklist

When you get paged:

1. **Identify the queue.** Open the queues admin route at
   `$APP_URL/api/v1/admin/queues`. Which queue has the failed/stuck
   jobs?
2. **Check Redis health.** `redis-cli -u $REDIS_QUEUE_URL ping` — must
   return `PONG`. If not, that's your incident.
3. **Check Postgres health.** `psql $DATABASE_URL -c "select 1"` — must
   return `1`. If not, that's your incident.
4. **Check air-gap state** (only relevant for self-hosted customers).
   `curl $APP_URL/api/health/airgap` — confirms the flag and which
   dispatchers honour it.
5. **Triage the failed jobs** per § 2 above.
6. **If you cannot triage in 30 minutes**, escalate via PagerDuty and
   start a comms incident:
   - File at `https://status.blackglasssec.com/`.
   - Notify affected tenants per `docs/incident-notification.md`.
7. **Once recovered**, run `node scripts/ops/verify-partition-integrity.mjs`
   to confirm no schema-level damage.
8. **File a post-mortem** within 5 business days. Lead with: timeline,
   contributing factors (5-whys), customer impact, fix shipped, and
   detection/prevention going forward. Cross-link relevant audit / Sentry
   IDs.

---

## 6. Related references

- [`docs/security-compliance.md`](../security-compliance.md) — security control mapping.
- [`docs/incident-notification.md`](../incident-notification.md) — customer notification policy.
- [`docs/data-retention-saas.md`](../data-retention-saas.md) — retention configuration.
- [`docs/architecture-overview.md`](../architecture-overview.md) — system architecture.
- [`blackglass-remediator/docs/safety-model.md`](../../blackglass-remediator/docs/safety-model.md) — remediator safety model.
- `src/lib/server/queue/config.ts` — queue configuration (source of truth).
- `scripts/ops/verify-partition-integrity.mjs` — partition + RLS sanity check.
- `scripts/ops/apply-migrations.mjs` — Drizzle migration runner (used in `db-migrate` workflow).
- `scripts/ops/check-migration-files.mjs` — static layout check (used in `db:migrate:files`).
- `.github/workflows/db-migrate.yml` — production migration runner (manual dispatch).
- `src/app/api/health/showcase/route.ts` — public showcase health probe.
- `src/app/api/admin/showcase/route.ts` — authenticated operator detail endpoint.
