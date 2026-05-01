# BLACKGLASS Operator Guide

## 1. What BLACKGLASS does

BLACKGLASS is a server integrity console. It:

1. **Captures a baseline** — a point-in-time snapshot of a host's listeners, users, sudo group, cron jobs, running services, SSH configuration, and firewall rules.
2. **Scans on demand** — re-collects all slices via SSH and compares them to the baseline.
3. **Surfaces drift** — any change that deviates from the baseline becomes a typed `DriftEvent` with a severity, category, rationale, and suggested remediation.

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

| Variable | Required | Example | Description |
|---|---|---|---|
| `COLLECTOR_HOST_1` | Yes | `165.227.229.48` | IP or hostname of the target server |
| `COLLECTOR_USER` | No | `blackglass` | SSH username (default: `blackglass`) |
| `SSH_PRIVATE_KEY` | Yes | `-----BEGIN OPENSSH PRIVATE KEY-----…` | Full PEM private key content |
| `COLLECTOR_HOST_1_NAME` | No | `prod-web-01` | Display label shown in the UI |

> On App Platform: mark `SSH_PRIVATE_KEY` as **Encrypted** (type: SECRET).

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

Or use the **Baselines** page in the console → click **Capture Baseline**.

The baseline records:
- TCP/UDP listeners (port, bind address, process name)
- System users with UID ≥ 1000
- Sudo group members
- Files in `/etc/cron.d/`
- Running systemd services
- `sshd_config` values for `PermitRootLogin` and `PasswordAuthentication`
- UFW firewall status and default inbound policy

> Baselines are held **in-process memory**. They survive as long as the server process runs. For persistent baselines across restarts, the team recommends capturing a new baseline after each planned maintenance window and before/after deployments.

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

| Severity | Meaning |
|---|---|
| **High** | Directly exploitable or policy-violating change (new privileged user, firewall disabled, root SSH enabled) |
| **Medium** | Significant deviation requiring review (new service, port removed from baseline) |
| **Low** | Minor or expected change |

### Categories

| Category | What it covers |
|---|---|
| `network_exposure` | New or removed TCP/UDP listeners |
| `identity` | New user accounts, sudo group changes |
| `persistence` | New cron jobs, new systemd services |
| `ssh` | Changes to `sshd_config` values |
| `firewall` | UFW status, default inbound policy |
| `packages` | (future: package version changes) |

### Lifecycle workflow

Each finding moves through these stages:

```
new → triaged → accepted_risk
                    ↓
              remediated → verified
```

| Stage | Meaning |
|---|---|
| `new` | Just detected — unreviewed |
| `triaged` | Reviewed; owner assigned |
| `accepted_risk` | Acknowledged as a known, accepted deviation |
| `remediated` | Fix applied; pending verification |
| `verified` | Re-scan confirmed the host is back to baseline |

---

## 6. Evidence bundles

Navigate to **Evidence** to export a bundle for audit or incident response. Each bundle includes:
- Drift event details with rationale and evidence summaries
- Collector provenance (which slice, confidence label, collection timestamp)
- Host trust score at time of export

---

## 7. Demo mode vs live mode

| | Demo mode (`NEXT_PUBLIC_USE_MOCK=true` or `COLLECTOR_HOST_1` not set) | Live mode |
|---|---|---|
| Data source | Hardcoded mock data in `src/data/mock/` | Real SSH collection |
| Baselines | Not persisted | In-process memory |
| Drift | Pre-generated synthetic events | Real diff vs captured baseline |
| Onboarding | Simulated collector detection | `collectorsOnline > 0` once baseline is captured |

---

## 8. Roles and access

| Role | Permissions |
|---|---|
| **Admin** | Full access: configure hosts, capture baselines, manage users |
| **Operator** | Run scans, view drift, manage findings lifecycle |
| **Auditor** | Read-only: view drift, download evidence bundles |

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

| Symptom | Likely cause | Fix |
|---|---|---|
| `collector_not_configured` from `/api/v1/baselines` | `COLLECTOR_HOST_1` or `SSH_PRIVATE_KEY` not set | Set both env vars and restart the server |
| `SSH connection error: connect ECONNREFUSED` | Target firewall blocking SSH | Open port 22 from the BLACKGLASS server IP |
| `SSH connection error: All configured authentication methods failed` | Wrong key or `authorized_keys` not set up | Verify `~/.ssh/authorized_keys` on target |
| No drift events after scan | No baseline captured | Call `POST /api/v1/baselines` first |
| `rate_limited` from `/api/v1/scans` | Too many scan requests (>1 per minute) | Wait 60 seconds before retrying |
| Build error on App Platform | Node engine version mismatch | App Platform uses Node 22 via `engines` field in `package.json` |

---

*BLACKGLASS — server integrity console · v0.1.0*
