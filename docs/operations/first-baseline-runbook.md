# First-baseline operator runbook

This is the single source of truth for "the new host won't onboard"
triage. The wizard's inline troubleshooting block, the install script's
exit-code hints, and the API's error responses all point here.

If you're a customer trying to install for the first time, **start at
[The wizard](#the-wizard) below**. If you're an operator on call,
jump to [Error code → remedy](#error-code--remedy).

---

## The wizard

The onboarding wizard at `/onboarding` is three real steps:

1. **Connect host** — generate API key, run one command on your server,
   wait for the first push (5 min cadence; wizard polls every 3s with
   an 8-min timeout that covers two full systemd cycles).
2. **Capture baseline** — preview what we received (sections, listeners,
   users, services), then explicitly pin the baseline.
3. **Run first scan** — POST `/api/v1/scans`, polled to completion.

### Pilot success criteria (what “good” looks like)

- **Connect:** First successful ingest within **~10 minutes** of a correct install (agent timer is 5 minutes; allow one extra cycle plus network slack).
- **Baseline:** Operator explicitly pins baseline in step 2 after reviewing the bundle preview — no silent auto-baseline.
- **Recoverability:** Transient errors should clear with a single retry or documented remedy; use **Reset and reinstall** only when the host state is actually wrong, not on every hiccup.

If anything goes sideways on any step, the wizard surfaces:

- The specific error code (mapped from the API response)
- The matching remedy (from `src/lib/client/onboarding-troubleshooting.ts`)
- A "Reset and reinstall" button that clears every per-host remnant
  and lets you start over without operator help.

---

## Error code → remedy

Every code below is returned by `/api/v1/ingest/agent` as
`{ error, detail, remedy }`. The wizard renders `remedy`. This table is
the complete, exhaustive list — if you see a code that's not here, it
shouldn't ship.

| Code                       | HTTP | Cause                                                                                                                           | Remedy                                                                                                                                                                                                       |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unauthorized`             | 401  | Bearer token doesn't match `INGEST_API_KEY` (or the per-host secret in `INGEST_HOST_KEYS_JSON`).                                | Confirm `BLACKGLASS_API_KEY` in `/etc/blackglass-agent.env` matches a key issued from Settings → Identity → API keys. If you rotated the key, re-run the install command with the new one.                  |
| `host_quota_exceeded`      | 403  | The tenant has reached its `hostLimit`.                                                                                         | Delete an unused host from `/hosts` or upgrade the plan from `/settings/billing`, then re-run the agent.                                                                                                     |
| `host_tombstoned`          | 410  | The host was deleted from the dashboard within the last 24h (default `HOST_TOMBSTONE_TTL_HOURS`).                               | Click **Reset and reinstall** in the wizard, or hit `/install-agent.sh?host=<id>` again — within 10 minutes of deletion the tombstone auto-clears. Or wait for the TTL to expire.                            |
| `rate_limited`             | 429  | Too many ingests for this host in a short window.                                                                               | The agent's 5-minute systemd timer is the right cadence. Disable any extra cron jobs, test loops, or Ansible plays that run the agent. Wait one minute and retry.                                            |
| `bundle_truncated`         | 422  | Fewer than 5 of the 17 sections came through. Almost always: collection script timed out (60s budget) or sudo refused commands. | Re-run `sudo /usr/local/bin/blackglass-agent.sh` manually on the host. Check stderr. If `systemctl list-units` is slow on this distro, edit the unit and bump `TimeoutStartSec`.                              |
| `bundle_missing_sections`  | 422  | Bundle is missing all of `ss` (listeners), `passwd` (users), and `sshd` (ssh config).                                           | The agent ran but couldn't read system state. Confirm the agent is running as root, and that the systemd service has `ProtectSystem=strict` not `ProtectSystem=full` (which blocks `/etc` reads).             |
| `parse_failed`             | 422  | A bundle section parsed badly (e.g., `passwd` has fields the parser doesn't expect).                                            | File an issue with the section name and a sample. We'll add a parser branch.                                                                                                                                 |
| `drift_pipeline_failed`    | 502  | The bundle parsed but downstream storage / DB writes failed.                                                                    | Check console logs for the underlying error. Usually transient — the next push (in ~5 min) succeeds. If persistent, check Postgres and Spaces health.                                                        |
| `ingest_not_configured`    | 503  | Neither `INGEST_API_KEY` nor `INGEST_HOST_KEYS_JSON` is set on the console.                                                     | Operator: set `INGEST_API_KEY` in the deployment environment. From the wizard, "Generate API key" calls `/api/v1/collector/keys/rotate` which writes a fresh key.                                            |
| `ingest_scope_invalid`     | 403  | `INGEST_SAAS_TENANT_ID` doesn't match a real tenant.                                                                            | Operator: check the deployment env. The value should be a real tenant UUID from the `saas_tenants` table.                                                                                                    |
| `database_unavailable`     | 503  | Tenant-scoped ingest requires `DATABASE_URL`, but it's not set.                                                                 | Operator: set `DATABASE_URL`. Single-tenant deployments can leave it unset and skip the SaaS tenant scoping.                                                                                                 |
| `validation_failed`        | 400  | Payload didn't match `AgentBundlePayloadSchema`.                                                                                | If you're running the standard agent, this should never happen. Capture the request body and file an issue.                                                                                                  |

---

## Verifying the agent from the host

Run the agent's pre-flight check (added in the bulletproof-first-baseline
wave) — this validates dependencies, reaches the ingest URL, and confirms
all 17 bundle sections are produced, without actually pushing:

```sh
sudo /usr/local/bin/blackglass-agent.sh --check
```

Expected output:

```
[blackglass-agent] OK: required commands present
[blackglass-agent] OK: DNS resolves blackglasssec.com
[blackglass-agent] OK: ingest endpoint reachable (HTTP 401 — expected for empty/probe payload)
[blackglass-agent] OK: bundle has all 17 expected sections (12345 bytes)
[blackglass-agent] --check complete (no push performed).
```

If any line says `FAIL`, fix that before re-running the actual push.

To force a synchronous push outside the systemd timer:

```sh
sudo /usr/local/bin/blackglass-agent.sh
```

To inspect the timer:

```sh
systemctl status blackglass-agent.timer
systemctl status blackglass-agent.service
journalctl -u blackglass-agent.service -n 50 --no-pager
```

---

## Reset procedure

The wizard's **Reset and reinstall** button calls
`POST /api/v1/onboarding/reset` which clears, in one cascade:

- Tombstone (so a fresh push isn't blocked)
- Pinned baseline
- All drift events for the hostId
- The in-process agent-snapshot cache entry

Returns the install URL the user should re-run on the host. Idempotent —
safe to call on a host that doesn't exist.

To do this manually from a console with `psql` access:

```sql
DELETE FROM saas_host_tombstones WHERE host_id = 'host-167-99-59-55';
DELETE FROM drift_events         WHERE host_id = 'host-167-99-59-55';
DELETE FROM baseline_snapshots   WHERE host_id = 'host-167-99-59-55';
```

(Then bounce the console to drop the in-memory snapshot cache.)

---

## SSH-pull onboarding

The wizard's **SSH pull** branch:

1. Generates an ed25519 keypair server-side (`POST /api/v1/onboarding/ssh-keypair`).
2. Shows the public key + an `ssh-copy-id`-style install one-liner.
3. Lets the user enter `host` / `port` / `user` and click **Test SSH**.
   The test calls `POST /api/v1/onboarding/ssh-test` which uses the
   draft private key (held in-process, 10-min TTL) to attempt a one-shot
   SSH connection and runs `whoami`.
4. On success, the user saves the host in Settings → Collector hosts
   and pastes the private key as the credential.

SSH test stages and remedies:

| Stage           | Cause                                                                                          | Remedy                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tcp_connect`   | TCP couldn't reach the host on the supplied port.                                              | Check the host's firewall (UFW, security group, cloud firewall) and confirm sshd is listening on the right port. From the host: `ss -tlnp | grep 22`.                                        |
| `ssh_handshake` | TCP succeeded but the SSH protocol didn't negotiate.                                           | Check the host's sshd config supports ed25519 (`HostKeyAlgorithms`). Confirm no IDS / fail2ban is blocking the console's IP.                                                                  |
| `ssh_auth`      | SSH handshake completed but the public key was rejected.                                       | Re-run the install command. Confirm `/home/blackglass/.ssh/authorized_keys` contains the public key, the file is mode 600 and owned by `blackglass:blackglass`, and the parent dir is mode 700. |
| `exec`          | Connected and authenticated, but `whoami` failed.                                              | Confirm the `blackglass` user has a valid login shell (the installer creates it with `/bin/bash`, not `/usr/sbin/nologin`).                                                                  |

---

## hostId derivation

Both the SSH-pull and push-agent paths produce IDs via
`src/lib/server/onboarding/host-id.ts#normaliseHostId`:

- `host-` prefix
- Lowercase
- Dots → dashes
- Anything not `[a-z0-9-]` → dashes
- Runs of dashes collapsed
- Leading / trailing dashes stripped

Examples:

```
"167.99.59.55"          → "host-167-99-59-55"
"Production-Web-01"     → "host-production-web-01"
"My Server (prod).int"  → "host-my-server-prod-int"
"host-167-99-59-55"     → "host-167-99-59-55"   (idempotent)
```

---

## Source of truth

If you change a remedy, change it in **both** places:

- `src/lib/server/onboarding/errors.ts` (server response)
- `src/lib/client/onboarding-troubleshooting.ts` (wizard UI)

`tests/unit/onboarding-errors.test.ts` enforces that every server code
has a matching client tip. CI fails on drift.
