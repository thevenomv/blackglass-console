# BLACKGLASS Operator Guide

## 1. What BLACKGLASS does

BLACKGLASS is a server integrity console. It:

1. **Captures a baseline** — a point-in-time snapshot of a host's listeners, users, sudo group, cron jobs, running services, SSH configuration, and firewall rules.
2. **Scans on demand** — re-collects all slices via SSH and compares them to the baseline.
3. **Surfaces drift** — any change that deviates from the baseline becomes a typed `DriftEvent` with a severity, category, rationale, and suggested remediation.

**End-to-end spine:** baseline capture → scan job → drift findings → investigation (UI / audit) → evidence/export surfaces. See **`docs/architecture-flow.md`** for how this maps to routes and `src/lib/server/` (including **`services/`** orchestration helpers).

**Staging / SaaS:** Before external pilots, run **`docs/staging-deployment-checklist.md`** and **`npm run verify:staging`** with **`STAGING_URL`**. Longer-term product phases: **`docs/saas-customer-roadmap.md`**.

---

## 2. Connecting a host

### 2a. Prerequisites on the target server

BLACKGLASS collects over SSH using a **read-only system account**. Run the following on the target server as root:

```bash
# Create a dedicated collector user (no login shell, no password)
useradd -r -s /usr/sbin/nologin blackglass

# Allow read access to the commands the collector uses
# (no sudo required for ss, getent, systemctl list-units, ufw status)
# ufw status requires root — grant limited sudo just for that:
echo "blackglass ALL=(root) NOPASSWD: /usr/sbin/ufw status verbose" \
  >> /etc/sudoers.d/blackglass
chmod 0440 /etc/sudoers.d/blackglass

# Add the BLACKGLASS console's public key
mkdir -p /home/blackglass/.ssh
chmod 700 /home/blackglass/.ssh
echo "<PASTE_PUBLIC_KEY_HERE>" >> /home/blackglass/.ssh/authorized_keys
chmod 600 /home/blackglass/.ssh/authorized_keys
chown -R blackglass:blackglass /home/blackglass/.ssh
```

> Replace `<PASTE_PUBLIC_KEY_HERE>` with the SSH public key from your BLACKGLASS deployment (see §2b).

### 2b. Generating the collector SSH key pair

Run this **once** to create a dedicated key pair for BLACKGLASS:

```bash
ssh-keygen -t ed25519 -C "blackglass-collector" -f ~/.ssh/blackglass_collector -N ""
```

This creates:

- `~/.ssh/blackglass_collector` — private key (keep secret, inject as `SSH_PRIVATE_KEY`)
- `~/.ssh/blackglass_collector.pub` — public key (copy to server in §2a)

### 2c. Environment variables

Set these on the BLACKGLASS console server (App Platform → Settings → Environment Variables, or in your shell for local testing):


| Variable                | Required                               | Example                                | Description                                                                                                                                                                                                              |
| ----------------------- | -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `COLLECTOR_HOST_1`      | Yes                                    | `165.227.229.48`                       | IP or hostname of the target server                                                                                                                                                                                      |
| `COLLECTOR_HOST_1_USER` | No                                     | `blackglass`                           | Per-host SSH user (overrides `COLLECTOR_USER` for that slot)                                                                                                                                                             |
| `COLLECTOR_HOST_1_PORT` | No                                     | `22`                                   | Per-host SSH port (overrides `COLLECTOR_PORT` for that slot)                                                                                                                                                             |
| `COLLECTOR_USER`        | No                                     | `blackglass`                           | Default SSH username when per-host user is unset                                                                                                                                                                         |
| `COLLECTOR_PORT`        | No                                     | `22`                                   | Default SSH port when per-host port is unset                                                                                                                                                                             |
| `SSH_PRIVATE_KEY`       | If `SECRET_PROVIDER` is `env` or unset | `-----BEGIN OPENSSH PRIVATE KEY-----…` | PEM private key (local / legacy). Prefer Doppler or Infisical in production so this is **not** stored on App Platform.                                                                                                   |
| `COLLECTOR_HOST_1_NAME` | No                                     | `prod-web-01`                          | Display label shown in the UI                                                                                                                                                                                            |
| `BASELINE_STORE_PATH`   | No                                     | `/data/blackglass/baselines.json`      | When set, baselines persist to this JSON file (mount a volume at the directory). If unset, baselines are **in-memory only** and are lost on restart.                                                                     |
| `DRIFT_HISTORY_PATH`    | No                                     | `/data/blackglass/drift-history.json`  | Optional. When set, each successful fleet scan appends **counts** to a rolling history file so the dashboard **Drift volume** chart can show a trend across days. Unset uses in-process memory only (resets on restart). |


### 2c-b. Secret manager (production)

JIT fetch at each baseline/scan (key stays in memory only for the duration of collection):


| Variable                                                        | Required                    | Example                                          | Description                                                                                                  |
| --------------------------------------------------------------- | --------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `SECRET_PROVIDER`                                               | No                          | `env` (default), `doppler`, `infisical`, `vault` | Backend for SSH material.                                                                                    |
| `BLACKGLASS_SSH_SECRET_NAME`                                    | No                          | `SSH_PRIVATE_KEY`                                | Name of the secret **inside** Doppler/Infisical that holds the PEM.                                          |
| **Doppler** `DOPPLER_TOKEN`                                     | If provider is `doppler`    | (service token)                                  | Short-lived / rotatable; not the SSH key.                                                                    |
| **Doppler** `DOPPLER_PROJECT`                                   | If `doppler`                | `blackglass`                                     | Doppler project slug.                                                                                        |
| **Doppler** `DOPPLER_CONFIG`                                    | If `doppler`                | `prd`                                            | Doppler config (environment).                                                                                |
| **Infisical** `INFISICAL_CLIENT_ID` / `INFISICAL_CLIENT_SECRET` | If `infisical`              |                                                  | Machine identity (Universal Auth).                                                                           |
| **Infisical** `INFISICAL_PROJECT_ID`                            | If `infisical`              | UUID                                             | Project (workspace) id.                                                                                      |
| **Infisical** `INFISICAL_ENV_SLUG`                              | If `infisical`              | `prod`                                           | Environment slug.                                                                                            |
| **Infisical** `INFISICAL_SITE_URL`                              | No                          | `https://app.infisical.com`                      | API base (self-hosted or SaaS).                                                                              |
| **Infisical** `INFISICAL_SECRET_PATH`                           | No                          | `/`                                              | Path to secrets folder in project.                                                                           |
| **Vault** `VAULT_ADDR`                                          | If `vault`                  | `https://vault.example:8200`                     | Vault API base URL.                                                                                          |
| **Vault** `VAULT_SSH_SIGN_ROLE`                                 | If `vault`                  | `blackglass-collector`                           | SSH secrets engine **sign** role name (`/v1/{mount}/sign/{role}`).                                           |
| **Vault** `VAULT_TOKEN`                                         | If `vault` (unless AppRole) |                                                  | Client token with permission to sign.                                                                        |
| **Vault** `VAULT_ROLE_ID` / `VAULT_SECRET_ID`                   | AppRole alternative         |                                                  | When set (and `VAULT_TOKEN` unset), login via `auth/approle/login`.                                          |
| **Vault** `VAULT_SSH_MOUNT`                                     | No                          | `ssh`                                            | Mount path of the SSH secrets engine.                                                                        |
| **Vault** `VAULT_SSH_VALID_PRINCIPALS`                          | No                          | `blackglass`                                     | Comma-separated principals on the signed cert (defaults to `COLLECTOR_USER` or `blackglass`).                |
| `COLLECTOR_MAX_PARALLEL_SSH`                                    | No                          | `8`                                              | Max concurrent SSH sessions when collecting **multiple** `COLLECTOR_HOST_*` targets (clamped 1–32).          |
| `BLACKGLASS_LOG_COLLECTOR`                                      | No                          | (on)                                             | Set `0`, `false`, or `off` to disable structured JSON stderr logs from the collector (`collector.*` events). |


> **Vault:** each scan generates a short-lived **ed25519** key pair in memory, calls **sign**, connects with **cert + private key**, then zeros buffers. Ensure the SSH engine role matches your target `authorized_keys` / principal expectations. `**revokeCredential`** calls `POST /v1/{mount}/revoke` with `serial_number` when used.

> `**POST /api/v1/scans`:** pass `host_ids` as collector `**hostId`** strings (e.g. `host-165-227-229-48`) to SSH **only** those hosts; omit or `[]` for the full configured fleet.

> **Doppler:** store the PEM under the same name as `BLACKGLASS_SSH_SECRET_NAME` (default `SSH_PRIVATE_KEY`). **Infisical:** raw secret API requires project settings compatible with machine access (see Infisical docs on E2EE vs `/raw`).

### 2c-c. Rotating credentials

**Doppler / Infisical service token (or machine identity)**

1. Issue a new token / client secret in the provider UI with the same read access.
2. Update the App Platform env vars, deploy.
3. Revoke the old token after a successful baseline or scan (watch `collector.secret_fetch.*` logs).

**SSH host key (PEM still in the secret manager)**

1. Add the **new** public key to each target `authorized_keys` while keeping the old key until verified.
2. Update the PEM secret in Doppler/Infisical (same secret name or new version), then run **Capture Baseline** and a **Scan**.
3. Remove the old public key from hosts when satisfied.

**Env-based `SSH_PRIVATE_KEY`**

1. Update the encrypted env in App Platform; redeploy if your platform requires it for secret changes.
2. Re-verify baseline + scan.

Structured logs use events such as `collector.secret_fetch.start`, `collector.secret_fetch.ok`, `collector.secret_fetch.error`, `collector.collection.start`, and `collector.collection.complete` — filter on `component: "blackglass.collector"`. No log line includes key material.

> On App Platform: when using `SECRET_PROVIDER=env`, mark `**SSH_PRIVATE_KEY**` as **Encrypted** (type: SECRET). When using Doppler/Infisical, mark provider tokens as **SECRET** and keep the PEM only in the secret manager.

`GET /api/health` includes `**baseline_store`**: `null` if `BASELINE_STORE_PATH` is unset, or `{ path, writable }`; `**collector**` diagnostics; and optionally `**secrets_probe**` when called as `**GET /api/health?probe=secrets**` (light reachability check: Doppler `/v3/me`, Infisical login, Vault `sys/health`; `env` provider reports a no-op detail).

### 2d. Verify connectivity

```bash
# Test SSH access before configuring BLACKGLASS
ssh -i ~/.ssh/blackglass_collector blackglass@165.227.229.48 "ss -tlnp"
```

You should see listening port output. If the connection hangs or is refused, check:

- Firewall rules on the target (allow SSH from the BLACKGLASS server IP)
- `~/.ssh/authorized_keys` is `0600` and owned by `blackglass`

---

## 3. Capturing a baseline

Once the collector is configured, **capture a baseline before making any changes**:

```bash
curl -X POST https://blackglass-j9imo.ondigitalocean.app/api/v1/baselines
```

This captures **one baseline per configured collector host** (`COLLECTOR_HOST_1`, `COLLECTOR_HOST_2`, …) in parallel. The JSON body lists each host under `captured`; any per-host SSH failures appear under `failed` while successful hosts are still saved.

Or use the **Baselines** page in the console → click **Capture Baseline**.

The baseline records:

- TCP/UDP listeners (port, bind address, process name)
- System users with UID ≥ 1000
- Sudo group members
- Files in `/etc/cron.d/`
- Running systemd services
- `sshd_config` values for `PermitRootLogin` and `PasswordAuthentication`
- UFW firewall status and default inbound policy

> Without `BASELINE_STORE_PATH`, baselines are held **in-process memory** only. Set `BASELINE_STORE_PATH` to a file on a mounted volume so baselines survive redeploys. Either way, capture a fresh baseline after each planned maintenance window and before/after deployments when integrity state changes.

**Production:** On DigitalOcean App Platform or Docker, the container filesystem is **ephemeral**. Treat `**BASELINE_STORE_PATH`** and `**DRIFT_HISTORY_PATH**` as paths on a **mounted volume** (Block Storage / PVC), or you will lose baselines and drift history on every restart or scale event. Confirm `GET /api/health` reports `baseline_store.writable: true` after deploy.

---

## 4. Running a scan

### 4a. Via the console

Click **Run Scan** on the dashboard. The progress banner updates in real time. Typical collection takes 5–15 seconds.

### 4b. Via API

```bash
# Trigger a scan
curl -X POST https://blackglass-j9imo.ondigitalocean.app/api/v1/scans \
  -H "Content-Type: application/json" \
  -d '{"host_ids": []}'

# Response: {"id":"<scan-id>","status":"queued"}

# Poll until succeeded or failed
curl https://blackglass-j9imo.ondigitalocean.app/api/v1/scans/<scan-id>
```

---

## 5. Reading the drift report

After a scan, navigate to **Drift** in the sidebar.

### Severity levels


| Severity   | Meaning                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| **High**   | Directly exploitable or policy-violating change (new privileged user, firewall disabled, root SSH enabled) |
| **Medium** | Significant deviation requiring review (new service, port removed from baseline)                           |
| **Low**    | Minor or expected change                                                                                   |


### Categories


| Category           | What it covers                        |
| ------------------ | ------------------------------------- |
| `network_exposure` | New or removed TCP/UDP listeners      |
| `identity`         | New user accounts, sudo group changes |
| `persistence`      | New cron jobs, new systemd services   |
| `ssh`              | Changes to `sshd_config` values       |
| `firewall`         | UFW status, default inbound policy    |
| `packages`         | (future: package version changes)     |


### Lifecycle workflow

Each finding moves through these stages:

```
new → triaged → accepted_risk
                    ↓
              remediated → verified
```


| Stage           | Meaning                                        |
| --------------- | ---------------------------------------------- |
| `new`           | Just detected — unreviewed                     |
| `triaged`       | Reviewed; owner assigned                       |
| `accepted_risk` | Acknowledged as a known, accepted deviation    |
| `remediated`    | Fix applied; pending verification              |
| `verified`      | Re-scan confirmed the host is back to baseline |


---

## 6. Evidence bundles

Navigate to **Evidence** to export a bundle for audit or incident response. Each bundle includes:

- Drift event details with rationale and evidence summaries
- Collector provenance (which slice, confidence label, collection timestamp)
- Host trust score at time of export

---

## 7. Demo mode vs live mode


|             | Demo mode (`NEXT_PUBLIC_USE_MOCK=true` or `COLLECTOR_HOST_1` not set) | Live mode                                        |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| Data source | Hardcoded mock data in `src/data/mock/`                               | Real SSH collection                              |
| Baselines   | Not persisted                                                         | In-process memory                                |
| Drift       | Pre-generated synthetic events                                        | Real diff vs captured baseline                   |
| Onboarding  | Simulated collector detection                                         | `collectorsOnline > 0` once baseline is captured |


---

## 8. Roles and access


| Role         | Permissions                                                   |
| ------------ | ------------------------------------------------------------- |
| **Admin**    | Full access: configure hosts, capture baselines, manage users |
| **Operator** | Run scans, view drift, manage findings lifecycle              |
| **Auditor**  | Read-only: view drift, download evidence bundles              |


Role enforcement is configured via `AUTH_REQUIRED` (enable/disable login) and the permissions module at `src/lib/auth/permissions.ts`.

---

## 9. Lab: end-to-end drift detection walkthrough

This walkthrough uses the DigitalOcean lab Droplet (`blackglass-lab-01`, `165.227.229.48`).

### Step 1 — Set environment variables

```bash
# Local or App Platform
export COLLECTOR_HOST_1=165.227.229.48
export COLLECTOR_HOST_1_NAME=blackglass-lab-01
export COLLECTOR_USER=blackglass
export SSH_PRIVATE_KEY="$(cat ~/.ssh/id_ed25519)"
```

### Step 2 — Capture baseline

```bash
curl -X POST http://localhost:3000/api/v1/baselines | jq .
```

Expected output includes `listenersCount`, `usersCount`, `servicesCount`, and `firewallActive: true`.

### Step 3 — Apply drift scenarios

```bash
ssh blackglass@165.227.229.48 "sudo bash /tmp/drift-sim.sh apply"
```

This applies 7 changes: TCP listener on 4444, new user `driftuser`, sudo escalation, malicious cron, SSH root login, firewall disabled, rogue systemd service.

### Step 4 — Run a scan

```bash
SCAN_ID=$(curl -s -X POST http://localhost:3000/api/v1/scans \
  -H "Content-Type: application/json" -d '{}' | jq -r .id)

# Poll until done
while true; do
  RESULT=$(curl -s http://localhost:3000/api/v1/scans/$SCAN_ID)
  STATUS=$(echo $RESULT | jq -r .status)
  echo "Status: $STATUS — $(echo $RESULT | jq -r .detail)"
  [ "$STATUS" = "succeeded" ] || [ "$STATUS" = "failed" ] && break
  sleep 2
done
```

### Step 5 — Review drift events

```bash
curl http://localhost:3000/api/v1/drift | jq '.items[] | {title, severity, category}'
```

You should see findings for each of the 7 applied changes.

### Step 6 — Revert and verify

```bash
ssh blackglass@165.227.229.48 "sudo bash /tmp/drift-sim.sh revert"
curl -X POST http://localhost:3000/api/v1/scans -H "Content-Type: application/json" -d '{}'
# After scan completes, drift events should clear (or have 'low' severity only)
```

---

## 10. Troubleshooting


| Symptom                                                              | Likely cause                                                                                                                                                                                     | Fix                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `collector_not_configured` from `/api/v1/baselines`                  | `COLLECTOR_HOST_1` or `SSH_PRIVATE_KEY` not set                                                                                                                                                  | Set both env vars and restart the server                                                |
| `SSH connection error: connect ECONNREFUSED`                         | Target firewall blocking SSH                                                                                                                                                                     | Open port 22 from the BLACKGLASS server IP                                              |
| `SSH connection error: All configured authentication methods failed` | Wrong key or `authorized_keys` not set up                                                                                                                                                        | Verify `~/.ssh/authorized_keys` on target                                               |
| No drift events after scan                                           | No baseline captured                                                                                                                                                                             | Call `POST /api/v1/baselines` first                                                     |
| `rate_limited` from `/api/v1/scans`                                  | Too many scan requests (>1 per minute)                                                                                                                                                           | Wait 60 seconds before retrying                                                         |
| `GET /api/health` shows `baseline_store.writable: false`             | Volume or directory not writable by the app                                                                                                                                                      | Fix mount permissions or path; check server logs for `[baseline-store]` write errors    |
| Dashboard KPIs look like the demo (12 hosts) but SSH is configured   | `NEXT_PUBLIC_USE_MOCK` still `true` without collector—actually with collector, `/` uses live inventory; if you require HTTP SSR only, set `NEXT_PUBLIC_USE_MOCK=false` and `NEXT_PUBLIC_APP_URL` |                                                                                         |
| Drift chart empty in live mode                                       | No scan history yet, or `DRIFT_HISTORY_PATH` unset and process restarted                                                                                                                         | Complete successful scans on multiple UTC days, or set `DRIFT_HISTORY_PATH` on a volume |
| Build error on App Platform                                          | Node engine version mismatch                                                                                                                                                                     | App Platform uses Node 22 via `engines` field in `package.json`                         |


---

*BLACKGLASS — server integrity console · v0.1.0*