# Backup & restore drill — Blackglass operator runbook

This runbook is the **single source of truth** for Blackglass disaster
recovery. It covers two things:

1. The **quarterly drill** — a recurring exercise that verifies the
   real backups can actually be restored into a fresh environment.
2. The **production restore procedure** — the same steps, executed
   under stress, when a real incident hits.

Doing the drill on a calendar — not "when we get a chance" — is the
single most valuable thing for both **SOC 2 Type II audit evidence**
(CC9.x — risk mitigation, BC/DR procedures) and for ensuring you can
actually recover when something goes wrong.

> **TL;DR for the next drill:** schedule a 2-hour block on a Friday.
> Fork production Postgres into a staging environment, point a
> staging deploy of the console at it, and verify five critical
> tenant queries succeed. Document the wall-clock time for each step
> in the table at the end of this file.

---

## SLOs we measure (RTO / RPO)

| Metric  | Target           | What it means                                                                                            |
| ------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| **RTO** | ≤ 4 hours        | Recovery Time Objective. From "control plane is down" to "operators can sign in and see their fleet."    |
| **RPO** | ≤ 5 minutes      | Recovery Point Objective. Maximum acceptable data loss measured against the most recent durable backup. |
| **MTTR-baseline** | ≤ 30 min | Time to restore a single tenant's baselines + drift events when only that tenant's data is corrupt.    |

The drill exists so we can **prove** the RTO is honest and so we can
**catch** RPO regressions early (e.g. backups silently broken for two
weeks).

---

## What gets backed up

| Asset                        | Where                                            | Backup method                                                            | Retention                  |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------- |
| **Postgres**                 | DigitalOcean Managed Postgres                    | Daily managed snapshots + 7-day point-in-time recovery (PITR)            | 7 days PITR, 30 days daily |
| **Spaces (evidence + audit JSONL)** | DigitalOcean Spaces (S3-compatible)         | Versioning enabled per bucket; lifecycle keeps non-current versions      | 90 days non-current        |
| **Redis (BullMQ state)**     | DigitalOcean Managed Redis                       | Treated as ephemeral. Daily snapshot only for diagnosis, NOT recovery.   | 7 days                     |
| **Secrets (KMS / env)**      | KMS provider + 1Password                         | Out-of-band; never in repo. Rotation procedure in `docs/secret-rotation` | Forever                    |

> Redis is intentionally not on the recovery path — every persistent
> piece of state is in Postgres or Spaces. Losing Redis costs you
> in-flight scan / webhook jobs, not data.

---

## Quarterly drill — Friday 2-hour window

### Pre-drill (the morning of)

- [ ] Block 2 hours on the operator on-call calendar; flag in
      `#blackglass-ops` so nobody triggers unrelated deploys.
- [ ] Confirm the staging DigitalOcean App Platform app is reachable
      and currently green: `https://staging.blackglasssec.com/api/health`.
- [ ] Confirm staging Spaces bucket exists and is empty (or full from
      the previous drill — we'll truncate it).
- [ ] Open a fresh page in this runbook (or a Linear ticket) for the
      drill record. Capture wall-clock start time below.

### Step 1 — Snapshot production Postgres (~5 min)

The DO Managed Postgres console exposes both **daily snapshots** and
**point-in-time** restore. For drills we use the latest daily snapshot
(so the procedure is identical to a real "we're recovering at 09:00 GMT
from yesterday's snapshot" event).

```bash
# Authenticated DO CLI
doctl databases db list <production-cluster-id>
doctl databases backups list <production-cluster-id> --format Name,CreatedAt,SizeGib
# Note the most recent backup's name; you'll select it in the next step.
```

**Why a snapshot, not pg_dump:** managed snapshots are bit-exact and
include extensions, GUCs, and partitions exactly as production has
them. `pg_dump` reconstructs schema and can drift.

### Step 2 — Restore into a staging cluster (~30 min)

Use the managed restore-to-new-cluster flow so the drill never touches
production:

```bash
doctl databases create blackglass-drill-$(date +%Y%m%d) \
  --engine pg \
  --restore-from-cluster-id <production-cluster-id> \
  --restore-from-timestamp <iso-8601-from-step-1> \
  --region lon1 --num-nodes 1 --size db-s-1vcpu-1gb
```

DO restores are typically 15–25 minutes for the production-class size.
While that runs, prep step 3.

### Step 3 — Mirror Spaces evidence into staging bucket (~10 min)

```bash
# DigitalOcean Spaces is S3-compatible — use AWS CLI with DO endpoint.
aws --endpoint-url https://lon1.digitaloceanspaces.com s3 sync \
  s3://blackglass-prod-evidence/ \
  s3://blackglass-staging-evidence/ \
  --delete
```

For the drill we sync the **whole bucket** so signed-PDF links resolve.
For a real incident you'd be restoring the actual production bucket
in-place from versioned objects — see the production playbook below.

### Step 4 — Point staging app at the restored cluster (~5 min)

In the staging App Platform component, swap `DATABASE_URL` and
`SPACES_BUCKET` to the freshly-restored values. Trigger a redeploy.

```bash
doctl apps update <staging-app-id> --spec spec/staging-drill.yaml
# Wait for the rolling deploy to settle.
doctl apps logs <staging-app-id> --type=deploy --follow
```

### Step 5 — Verify (~30 min — the actual drill)

This is the part nobody skips. **Five critical queries**, all run
against the restored staging app. Tick each one off; record the
wall-clock at first successful render.

- [ ] **Sign in** as `jamie@obsidiandynamics.co.uk` via Clerk → land on
      `/dashboard`. Tenant context should resolve correctly.
- [ ] **Fleet roster:** `GET /api/v1/hosts` returns the same host
      count as production at the snapshot time (compare against a
      pre-drill screenshot).
- [ ] **Drift events:** `GET /api/v1/drift?limit=50` returns the same
      most-recent 50 events. Spot-check one event's evidenceSummary
      JSON for parity.
- [ ] **Evidence bundle:** open the most recent bundle via
      `/evidence/bundles/<id>`. Click the signed-PDF link — it should
      resolve from the staging Spaces bucket (verifies sync worked).
- [ ] **Audit log:** `GET /api/v1/saas-audit?limit=20` returns the
      most recent 20 events including any rotations or member-add
      events from the prior 24 h.

### Step 6 — Tear down and record (~10 min)

- [ ] Destroy the drill DB cluster: `doctl databases delete <name>`.
- [ ] Truncate the staging Spaces bucket so the next drill starts clean.
- [ ] Revert staging app spec to its non-drill values.
- [ ] **Fill in the table at the end of this file.** Commit the change.

---

## Production restore — what to do at 03:00 when it's real

Same steps, different blast radius. Two important deltas:

1. **Restore in-place, not into a fresh cluster.** Use DO's managed
   PITR to restore the same `production` cluster to the latest healthy
   timestamp. The console keeps the same `DATABASE_URL` and you avoid
   a config-swap blast.
2. **Spaces uses versioned object restore, not a sync.** For each
   corrupted prefix, list non-current versions and restore the most
   recent good one:

   ```bash
   aws --endpoint-url https://lon1.digitaloceanspaces.com s3api \
     list-object-versions \
     --bucket blackglass-prod-evidence \
     --prefix evidence/ten_<id>/<incident-time-prefix>
   # Then `s3api copy-object` with the chosen VersionId.
   ```

After restore:

- [ ] Run `/api/health` and `/api/health/queue` — both should be 200.
- [ ] Trigger one synthetic scan against a known-good host; verify
      drift events appear within 5 min.
- [ ] Post a status update to `/status` (or Better Uptime when adopted).
- [ ] Open a post-mortem ticket within 24 h. Capture the actual RTO/RPO
      observed and add it to the trend table below.

---

## Drill log

Append a row at the end of every drill. Do not edit historical rows —
the trend is the audit evidence.

| Date       | Drill operator | Snapshot age | Restore wall-clock | Verify wall-clock | RTO observed | RPO observed | Notes                                  |
| ---------- | -------------- | ------------ | ------------------ | ----------------- | ------------ | ------------ | -------------------------------------- |
| _yyyy-mm-dd_ | _name_       | _e.g. 12 h_  | _mm:ss_            | _mm:ss_           | _hh:mm_      | _hh:mm_      | _e.g. "spaces sync was the long pole"_ |

**Next drill due:** schedule the next one at the end of every drill.
SOC 2 wants quarterly cadence; we run it on the **first Friday after
each calendar quarter**.
