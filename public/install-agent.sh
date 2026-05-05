#!/usr/bin/env bash
# BLACKGLASS agent installer
# Usage: curl -fsSL https://blackglasssec.com/install-agent.sh | BLACKGLASS_KEY=<key> bash
#
# Optional env vars:
#   BLACKGLASS_URL   Server URL (default: https://blackglasssec.com)
#   BLACKGLASS_USER  System user to create (default: blackglass)
set -euo pipefail

BLACKGLASS_URL="${BLACKGLASS_URL:-https://blackglasssec.com}"
AGENT_USER="${BLACKGLASS_USER:-blackglass}"
AGENT_BIN="/usr/local/bin/blackglass-agent"
CONF_DIR="/etc/blackglass"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[blackglass]${NC} $*"; }
warn()  { echo -e "${YELLOW}[blackglass]${NC} $*"; }
fatal() { echo -e "${RED}[blackglass] ERROR:${NC} $*" >&2; exit 1; }

[[ "${EUID:-$(id -u)}" -eq 0 ]] || fatal "Run as root (sudo or su)"
[[ -n "${BLACKGLASS_KEY:-}" ]] || fatal "BLACKGLASS_KEY is required"
command -v python3 >/dev/null 2>&1 || fatal "python3 is required (apt install python3)"

info "Installing BLACKGLASS agent..."

# ── 1. System user ────────────────────────────────────────────────────────────
if ! id -u "$AGENT_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$AGENT_USER"
  info "Created system user: $AGENT_USER"
fi

# ── 2. Config dir + credentials ───────────────────────────────────────────────
mkdir -p "$CONF_DIR"
chmod 700 "$CONF_DIR"
printf '%s' "$BLACKGLASS_KEY" > "$CONF_DIR/key"
printf '%s' "$BLACKGLASS_URL" > "$CONF_DIR/url"
chmod 600 "$CONF_DIR/key" "$CONF_DIR/url"
chown -R root:root "$CONF_DIR"

# ── 3. Agent script ───────────────────────────────────────────────────────────
cat > "$AGENT_BIN" << 'PYEOF'
#!/usr/bin/env python3
"""BLACKGLASS push agent — collects system telemetry and sends it to the console."""
import json, os, re, socket, subprocess, sys, datetime
from urllib import request as urlrequest, error as urlerror

CONF = "/etc/blackglass"

def read_conf(name):
    try:
        return open(f"{CONF}/{name}").read().strip()
    except OSError:
        return ""

KEY = read_conf("key")
URL = read_conf("url").rstrip("/")
if not KEY or not URL:
    print("[blackglass-agent] Missing key or url in /etc/blackglass", file=sys.stderr)
    sys.exit(1)

def run(cmd, fallback=""):
    try:
        return subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL, text=True)
    except Exception:
        return fallback

# ── hostId + hostname ─────────────────────────────────────────────────────────
def get_primary_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return socket.gethostbyname(socket.gethostname())

primary_ip = get_primary_ip()
host_id = "host-" + primary_ip.replace(".", "-")
hostname = socket.getfqdn() or primary_ip

# ── listeners ─────────────────────────────────────────────────────────────────
def parse_listeners():
    out = run("ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null")
    listeners = []
    seen = set()
    for line in out.splitlines():
        # ss format: State Recv-Q Send-Q Local-Address:Port Peer-Address:Port Process
        m = re.match(r'\S+\s+\S+\s+\S+\s+([\d.*:\[\]a-fA-F]+):(\d+)\s+.*?(?:users:\("([^"]+)")?', line)
        if not m:
            continue
        port = int(m.group(2))
        bind = m.group(1)
        proc = m.group(3).split(",")[0] if m.group(3) else None
        key = ("tcp", bind, port)
        if key not in seen:
            seen.add(key)
            entry = {"proto": "tcp", "bind": bind, "port": port}
            if proc:
                entry["process"] = proc
            listeners.append(entry)
    return listeners

# ── users ─────────────────────────────────────────────────────────────────────
def parse_users():
    users = []
    try:
        for line in open("/etc/passwd"):
            parts = line.strip().split(":")
            if len(parts) < 4:
                continue
            uid = int(parts[2])
            if 1000 <= uid < 65534:
                users.append({"username": parts[0], "uid": uid})
    except OSError:
        pass
    return users

# ── sudoers ───────────────────────────────────────────────────────────────────
def parse_sudoers():
    members = set()
    def scan(path):
        try:
            for line in open(path):
                line = line.strip()
                if line.startswith("#") or not line:
                    continue
                # %sudo ALL=... or username ALL=...
                m = re.match(r'^%?(\w+)\s+ALL', line)
                if m:
                    members.add(m.group(1))
        except OSError:
            pass
    scan("/etc/sudoers")
    import glob
    for f in glob.glob("/etc/sudoers.d/*"):
        scan(f)
    return list(members)

# ── cron ──────────────────────────────────────────────────────────────────────
def parse_cron():
    import glob
    entries = []
    for f in glob.glob("/etc/cron.d/*"):
        if os.path.isfile(f):
            entries.append({"filename": os.path.basename(f)})
    return entries

# ── services ──────────────────────────────────────────────────────────────────
def parse_services():
    out = run("systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null")
    services = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 4:
            services.append({"unit": parts[0], "sub": parts[2]})
    return services

# ── ssh config ────────────────────────────────────────────────────────────────
def parse_ssh():
    result = {"permitRootLogin": "unknown", "passwordAuthentication": "unknown"}
    try:
        for line in open("/etc/ssh/sshd_config"):
            line = line.strip()
            if re.match(r'(?i)^PermitRootLogin\s+', line):
                result["permitRootLogin"] = line.split()[1]
            elif re.match(r'(?i)^PasswordAuthentication\s+', line):
                result["passwordAuthentication"] = line.split()[1]
    except OSError:
        pass
    return result

# ── firewall ──────────────────────────────────────────────────────────────────
def parse_firewall():
    out = run("ufw status verbose 2>/dev/null")
    active = bool(re.search(r'Status:\s*active', out, re.I))
    default_in = "unknown"
    m = re.search(r'Default:\s*(\w+)\s*\(incoming\)', out, re.I)
    if m:
        default_in = m.group(1)
    rules = [l.strip() for l in out.splitlines() if "--" in l or re.match(r'\d', l.strip())]
    return {"active": active, "defaultInbound": default_in, "rules": rules[:256]}

# ── assemble + send ───────────────────────────────────────────────────────────
payload = {
    "hostId": host_id,
    "hostname": hostname,
    "collectedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "listeners": parse_listeners(),
    "users": parse_users(),
    "sudoers": parse_sudoers(),
    "cronEntries": parse_cron(),
    "services": parse_services(),
    "ssh": parse_ssh(),
    "firewall": parse_firewall(),
}

body = json.dumps(payload).encode("utf-8")
req = urlrequest.Request(
    f"{URL}/api/v1/ingest",
    data=body,
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"},
    method="POST",
)
try:
    with urlrequest.urlopen(req, timeout=30) as resp:
        print(f"[blackglass-agent] OK {resp.status} — hostId={host_id}")
except urlerror.HTTPError as e:
    print(f"[blackglass-agent] HTTP {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
    sys.exit(1)
except Exception as ex:
    print(f"[blackglass-agent] Error: {ex}", file=sys.stderr)
    sys.exit(1)
PYEOF

chmod +x "$AGENT_BIN"

# ── 4. Systemd service + timer ────────────────────────────────────────────────
if command -v systemctl >/dev/null 2>&1 && [[ -d /etc/systemd/system ]]; then
  cat > /etc/systemd/system/blackglass-agent.service << EOF
[Unit]
Description=BLACKGLASS telemetry agent
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$AGENT_BIN
User=root
StandardOutput=journal
StandardError=journal
EOF

  cat > /etc/systemd/system/blackglass-agent.timer << EOF
[Unit]
Description=Run BLACKGLASS agent every 5 minutes

[Timer]
OnBootSec=30s
OnUnitActiveSec=5min
Unit=blackglass-agent.service

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now blackglass-agent.timer
  info "Systemd timer enabled (every 5 minutes)"
else
  # Cron fallback
  (crontab -l 2>/dev/null | grep -v blackglass-agent; echo "*/5 * * * * $AGENT_BIN >> /var/log/blackglass-agent.log 2>&1") | crontab -
  info "Cron job installed (every 5 minutes)"
fi

# ── 5. First run ──────────────────────────────────────────────────────────────
info "Sending first snapshot..."
if "$AGENT_BIN"; then
  info "Done. Your host will appear in the BLACKGLASS fleet dashboard shortly."
else
  warn "First snapshot failed — check $CONF_DIR/key and $CONF_DIR/url. The timer will retry."
fi
