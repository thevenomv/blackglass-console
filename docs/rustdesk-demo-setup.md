# RustDesk + BLACKGLASS: self-hosted ID server and demo desktop

This guide covers **self-hosted RustDesk** (open-source `hbbs` / `hbbr`) with **BLACKGLASS**: a monitored Linux desktop you can open in RustDesk while **capturing baselines and drift** in the product.

Use it for **live demos**: viewers see the desktop change in RustDesk and see **BLACKGLASS** surface the same changes in scans and drift.

---

## Architecture (two common layouts)

### A — Single droplet (simplest)

One Ubuntu VM runs **both** the RustDesk server (Docker) **and** the graphical client + XFCE. Use **[`scripts/rustdesk-userdata.sh`](../scripts/rustdesk-userdata.sh)** as DigitalOcean **User Data** on create. The droplet’s public IP is the ID server; clients use the key from `/opt/rustdesk-server/data/id_ed25519.pub` (or `/root/rustdesk-info.txt` after cloud-init).

### B — Split ID server + demo VM (recommended for a fixed “booth” setup)

| Role | Purpose |
|------|--------|
| **ID / relay server** | Runs `hbbs` + `hbbr` only (often Docker under `/opt/rustdesk`). Clients and the demo VM all point here. |
| **Demo Linux VM** | XFCE + RustDesk **client** only; no public RustDesk ports required except **outbound** to the ID server. |

Scripts:

- **[`scripts/rustdesk-do-console-setup.sh`](../scripts/rustdesk-do-console-setup.sh)** — run **on the ID server**. Opens UFW **21114**; if **`hbbs` is systemd-managed**, adds **`-r`**. Does **not** change Docker compose — adjust `hbbs` there yourself. Optionally set **`KEY='ssh-ed25519 ...'`** when piping the script so your public key is appended to `authorized_keys`.
- **[`scripts/rustdesk-linux-demo-setup.sh`](../scripts/rustdesk-linux-demo-setup.sh)** — run **on the demo VM** to install the RustDesk client and point it at your ID server.
- **[`scripts/rustdesk-windows-apply-config.ps1`](../scripts/rustdesk-windows-apply-config.ps1)** — run **elevated on Windows** so your laptop uses the same ID server and key.

Override server address and public key without editing files:

```bash
export RD_ID_SERVER='YOUR_ID_SERVER_IP'
export RD_PUBLIC_KEY='YOUR_hbbs_PUBLIC_KEY'
```

```powershell
$env:RD_ID_SERVER = 'YOUR_ID_SERVER_IP'
$env:RD_PUBLIC_KEY = 'YOUR_hbbs_PUBLIC_KEY'
```

---

## Ports and firewalls

RustDesk expects these on the **ID / relay host** (and on **any cloud firewall** in front of it):

| Port | Protocol | Role |
|------|-----------|------|
| **21114** | TCP | **RustDesk 1.4+ clients probe this** (HTTP client to the ID host). If this is **dropped** (not rejected), clients can **hang** during rendezvous → peers look **“offline”** / `deadline has elapsed`. **Allow TCP 21114** on UFW and on your cloud firewall. Nothing needs to *listen* on 21114 for OSS; the OS should **RST** quickly. |
| 21115 | TCP | NAT type test |
| 21116 | TCP + UDP | ID / rendezvous |
| 21117 | TCP | Relay |
| 21118–21119 | TCP | WebSocket / related |

**UFW example (ID server):**

```bash
ufw allow 22/tcp
ufw allow 21114/tcp comment 'RustDesk 1.4+ client probe'
ufw allow 21115:21119/tcp
ufw allow 21116/udp
ufw enable
```

**DigitalOcean Cloud Firewall:** mirror the same inbound rules for the ID server droplet.

---

## ID server: Docker (`hbbs` / `hbbr`)

Official pattern: `docker compose` with `network_mode: host`, data directory holding `id_ed25519.pub`.

1. **`hbbs` must know the public relay address** so clients get the correct relay in registration. Set the relay host to your ID server’s **public IP** (or DNS), e.g. `-r YOUR_PUBLIC_IP`.
2. Read **`id_ed25519.pub`** — that string is the **key** every client uses in Settings → Network (or via `--config "host=...,key=..."`).

Example `hbbs` command shape (adjust paths / compose file):

```yaml
# conceptual — your compose may differ
command: hbbs -r YOUR_PUBLIC_IP
```

After changes: `docker compose down && docker compose up -d`, then `docker logs hbbs` and confirm relay / key.

### systemd `hbbs.service` (if not using Docker)

If `hbbs` runs under systemd, append **`-r YOUR_PUBLIC_IP`** to `ExecStart` (drop-in override). Manual steps if you cannot use the console script:

```bash
systemctl cat hbbs.service
# Create drop-in adding -r YOUR_PUBLIC_IP to ExecStart, then:
systemctl daemon-reload
systemctl restart hbbs.service
```

---

## Clients

### Relay port in the UI

RustDesk shows **relay** as `host:21117`. Use port **21117**, not **2116** (common typo).

### Windows (after installing RustDesk)

From an **elevated** PowerShell, from the repo:

```powershell
.\scripts\rustdesk-windows-apply-config.ps1
```

Or:

```powershell
& "$env:ProgramFiles\RustDesk\rustdesk.exe" --config "host=YOUR_ID_SERVER_IP,key=YOUR_PUBLIC_KEY"
```

Quit RustDesk completely (tray icon) after changing config, then reopen.

### Linux demo VM

```bash
# Example: copy script up, then:
sudo RD_ID_SERVER='YOUR_ID_SERVER_IP' RD_PUBLIC_KEY='YOUR_KEY' \
  bash ./rustdesk-linux-demo-setup.sh
```

Optional permanent password for demos:

```bash
sudo RD_PERM_PASSWORD='choose-a-strong-password' RD_ID_SERVER='...' RD_PUBLIC_KEY='...' \
  bash ./rustdesk-linux-demo-setup.sh
```

**Headless / Xvfb:** if the service runs on `:1`, use a systemd drop-in for `rustdesk.service`:

```ini
[Service]
Environment=DISPLAY=:1
```

### Config pitfalls (cause “offline” / wrong peer)

- **Truncated public key** in the UI vs on disk — use the full line from `id_ed25519.pub`.
- **Wrong relay port** (2116 vs **21117**).
- **`local-ip-addr`** in `RustDesk2.toml` pointing at a VPN or unrelated interface — remove unless you know you need it.
- **Firewall drops on 21114** — see ports table above.

---

## Hook the demo VM into BLACKGLASS

After the collector reaches the demo host, register it in your workspace (for example via DigitalOcean App + your existing bootstrap scripts). Example pattern:

```powershell
.\scripts\configure-collector-on-app.ps1 `
  -Token    $env:DO_TOKEN `
  -AppId    YOUR_DO_APP_ID `
  -HostIp   YOUR_DEMO_VM_IP `
  -HostName "rustdesk-demo"
```

Then in **BLACKGLASS**: **Capture baseline** on that host.

---

## Demo storyline (show this in the web app under **/demo/showcase**)

| Step | What you do | What the audience sees |
|------|----------------|-------------------------|
| 1 | **Capture baseline** in BLACKGLASS | Clean posture |
| 2 | In the RustDesk session (terminal on the demo VM): `sudo apt update && sudo apt install -y nmap` | Obvious desktop action |
| 3 | **Run scan** | New package / binary surfaced |
| 4 | From **local SSH** to the same VM (not in RustDesk): `sudo useradd -m demo-attacker` | Desktop unchanged |
| 5 | **Run scan** | New local user surfaced — “silent” change vs what they watched |

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Peer **offline** / rendezvous **deadline** | ID server: **TCP 21114 allowed** end-to-end; `hbbs` has **`-r public_ip`**; client key and relay port **21117**; full key; quit and restart RustDesk. |
| **Connection refused** on 21114 quickly | Normal on OSS if nothing listens — good (not a firewall blackhole). |
| RustDesk ID **NOT_READY** | Wait for key generation; `docker logs hbbs` or check `/opt/rustdesk-server/data/`. |
| **Black screen** in RustDesk | XFCE/Xvfb still starting; wait and reconnect; confirm `DISPLAY` for `rustdesk.service`. |
| **garbled console** when pasting long scripts | Use `curl -fsSL ... \| bash` from GitHub raw URL instead of pasting from Windows. |

Cloud-init / userdata log on a userdata-based droplet:

```bash
tail -f /var/log/rustdesk-init.log
```

---

## Teardown

Delete droplets from the control panel or API when finished. Rotate any **passwords** or **API tokens** that were used in shared screens or chats.

---

## Security

- Do not commit or paste **DigitalOcean API tokens** or **production** RustDesk passwords into chats.
- Treat **demo permanent passwords** as disposable; rotate after streams or recordings.
