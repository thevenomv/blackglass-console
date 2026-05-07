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
| `blackglass-scans`           | SSH collection + drift compute                                   | 3        | 2 s base              | RAM-capped, ≤ 32     | 100 jobs           |
| `blackglass-sandbox`         | Sandbox provision / seed-drift / cleanup                         | 5/3/10   | 5 s / 10 s / 30 s     | 2                    | 50 jobs            |
| `blackglass-webhooks`        | Outbound webhook delivery (Slack, PagerDuty, OCSF, etc.)         | 6        | 5 s base              | 8                    | 200 jobs (DLQ)     |
| `blackglass-exports`         | Tenant data-export bundle assembly + Spaces upload               | 3        | 30 s base             | 2                    | 50 jobs            |
| `blackglass-evidence`        | Evidence bundle assembly                                         | 3        | 30 s base             | 2                    | 50 jobs            |
| `blackglass-reports`         | PDF / Markdown report generation                                 | 3        | 30 s base             | 2                    | 50 jobs            |
| `blackglass-maintenance`     | Retention sweep, idempotency pruning, repeatable crons           | 1        | n/a                   | 1                    | 20 jobs            |

### Healthy steady state

- **Scans:** Less than 30 s end-to-end per host on a happy SSH connection.
  Active jobs ≤ concurrency cap; failed-job count not climbing.
- **Webhooks:** Delivery latency < 5 s. The "Failed" tab in the queue
  dashboard should be empty under normal operation; transient 5xx
  retries are normal but should drain within a minute.
- **Sandbox:** Provision → seed-drift → cleanup all complete within
  ~10 minutes per remediation. Stale Droplets are caught by the
  cleanup queue's high attempt count (10) — see § 2.4.
- **Exports + Reports + Evidence:** I/O bound — typical job is 5–60 s.

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

**Triage:** Maintenance jobs run on a repeating schedule (every 5–60
minutes), so a single failure self-heals on the next tick. **Page only
if the same job class fails more than 3 ticks in a row** — that
indicates a code bug, not a transient blip.

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
8. **File a post-mortem** within 5 business days. Template at
   `docs/runbooks/post-mortem-template.md` (TODO: create if missing).

---

## 6. Related references

- [`docs/security-compliance.md`](../security-compliance.md) — security control mapping.
- [`docs/incident-notification.md`](../incident-notification.md) — customer notification policy.
- [`docs/data-retention-saas.md`](../data-retention-saas.md) — retention configuration.
- [`docs/architecture-overview.md`](../architecture-overview.md) — system architecture.
- [`blackglass-remediator/docs/safety-model.md`](../../blackglass-remediator/docs/safety-model.md) — remediator safety model.
- `src/lib/server/queue/config.ts` — queue configuration (source of truth).
- `scripts/ops/verify-partition-integrity.mjs` — partition + RLS sanity check.
