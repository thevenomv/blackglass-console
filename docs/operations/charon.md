# Charon (cloud resource janitor)

Charon links read credentials for **DigitalOcean**, **AWS**, or **GCP**, runs periodic or on-demand **inventory scans**, scores likely-idle resources, and supports a **human-in-the-loop cleanup queue** (dry-run or live delete when the plan allows).

Customer-facing summaries of data handling appear on **`/privacy`**, **`/terms`**, and **`/security`** (marketing site). This file is the operator-facing IAM, trust-model, and behaviour reference.

## Trust model

- **Scans** use stored credentials (envelope-encrypted per tenant) only on the server or worker.
- **Live cleanup** runs only after an explicit approve (console or Slack interactivity). Failed deletes persist a `failed` row in the cleanup queue with a redacted error string.
- **HTTP guard:** cleanup enqueue + approve share a dedicated per-IP rate limit (`checkJanitorCleanupPostRate` — see `docs/security/http-rate-limit-budgets.md`), separate from baseline capture quotas.
- **Slack interactivity** requires `SLACK_SIGNING_SECRET` and verifies `X-Slack-Signature`.

## Blast radius (protector tags)

Charon treats some tag markers as **never eligible for live delete**, and drops them from the findings list after scan policy is applied:

- **Built-in markers** (matched case-insensitively on finding tag keys or values): `production`, `prod`, `critical`, `do-not-delete`, `blackglass-protected` (same set as idle-scoring heuristics on DO tags).
- **Tenant extras**: `protectTagsExtraLower` in workspace Charon policies.

**Live cleanup queue:** requests are **not created** for protected findings. **Approve path:** if a stale request somehow reaches approval, execution is **blocked** before any cloud delete (`cleanup_blocked_protected` / audit `janitor.cleanup.blocked_protect_tag`). **Immediately before delete**, Charon **re-reads** the resource’s current tags (DigitalOcean / AWS EC2) or labels (GCP) and blocks again if a merged protector marker appears (`cleanup_blocked_protected` / audit `janitor.cleanup.blocked_protect_tag_live`). Dry-run simulations are unaffected.

## Minimum IAM / scopes (copy-paste starters)

These are **starting points** — tighten to your org. Live cleanup needs **write** actions; inventory-only needs **read**.

### AWS (inventory + live delete)

By default Charon scans **one region** from the access-key JSON (`region`, default `us-east-1`). Optionally include **`regions`** (array of region codes, deduped, max 14) to scan multiple regions in one job; failures in one region do not block others.

Example credential blob (stored encrypted in Charon):

```json
{
  "accessKeyId": "AKIA…",
  "secretAccessKey": "…",
  "region": "us-east-1",
  "regions": ["us-east-1", "eu-west-1", "ap-southeast-1"]
}
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CharonInventory",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeVolumes",
        "ec2:DescribeSnapshots",
        "ec2:DescribeTags"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CharonLiveCleanupOptional",
      "Effect": "Allow",
      "Action": [
        "ec2:TerminateInstances",
        "ec2:DeleteVolume",
        "ec2:DeleteSnapshot"
      ],
      "Resource": "*"
    }
  ]
}
```

### GCP (service account JSON)

- **Read-only scan:** `roles/compute.viewer` on the project (or custom role with `compute.disks.list`, `compute.snapshots.list`, etc.).
- **Live cleanup:** add `compute.disks.delete`, `compute.snapshots.delete` (e.g. via `roles/compute.instanceAdmin.v1` is broader than necessary — prefer a custom role).

Charon uses the OAuth scope `https://www.googleapis.com/auth/compute.readonly` for listing and `https://www.googleapis.com/auth/compute` for deletes.

### DigitalOcean

- **Read:** token with read access to account, droplets, volumes, snapshots, and monitoring (for metrics).
- **Write:** `delete` on droplets, volumes, and snapshots for live cleanup.

## Scan diff & webhooks

Each successful scan stores a compact **snapshot** of `(resource_type, resource_id, idle_score)` and a **diff** versus the previous successful scan: `added`, `removed`, and `scoreChanged` (with capped detail rows for UI/webhooks).

When Charon policy **`webhookOnScan`** is `true`, the workspace receives a signed JSON POST to every configured tenant **webhook URL** (same `X-Blackglass-Signature` behavior as drift webhooks) with `event: "charon.scan.completed"` and a `diff` object. Uses the BullMQ webhook queue when `REDIS_QUEUE_URL` is set; otherwise delivers inline.

**Envelope (v1):** `schemaVersion: 1`, `dispatchedAt` (ISO emit time, analogous to drift’s top-level `timestamp`), `scanId`, `tenantId`, `timestamp` (scan completion instant), plus `accountId`, `provider`, `findingsCount`, and `diff`. Receivers should key off `schemaVersion` + `event` for forward-compatible parsing.

## Suppressions (dismiss / snooze)

Operators can **dismiss** a finding permanently (until the suppression row is removed) or **snooze** it for 7–30 days (configurable up to 365 days via API). Suppressions are keyed by `(account_id, resource_type, resource_id)` and are applied **after** tenant Charon policies on each successful scan, so snoozed resources stay out of the findings table until the snooze expires.

## Console deep links

The Charon UI builds “Open” links into each vendor console using `resourceType`, `resourceId`, and `metrics_meta` (e.g. AWS `region`, GCP `zone`, `gcpProjectId`, snapshot scope). Regenerate links by re-running a scan if metadata is missing.

## Related env vars

See `.env.example` (Charon / Slack / schedule / Stripe add-on). Scheduled scans use the maintenance queue and `CHARON_SCHEDULE_TICK_MINUTES`.
