#!/usr/bin/env bash
# blackglass-agent.sh — BLACKGLASS push-ingest agent
#
# Collects the same security telemetry as the BLACKGLASS SSH collector and
# pushes it to your BLACKGLASS instance via the /api/v1/ingest endpoint.
#
# REQUIRED environment variables:
#   BLACKGLASS_INGEST_URL   — full URL, e.g. https://blackglasssec.com/api/v1/ingest
#   BLACKGLASS_API_KEY      — shared Bearer secret (INGEST_API_KEY on the server)
#
# OPTIONAL environment variables:
#   BLACKGLASS_HOST_ID      — overrides auto-detected hostname as the host identifier
#   BLACKGLASS_DRY_RUN      — set to "1" to print payload without sending
#
# Usage:
#   curl -sSL https://blackglasssec.com/api/v1/ingest/agent | sudo bash
#   # OR download and run:
#   sudo bash blackglass-agent.sh
#
# Install as cron (every hour, root):
#   echo "0 * * * * root BLACKGLASS_INGEST_URL=... BLACKGLASS_API_KEY=... /usr/local/bin/blackglass-agent.sh" \
#     | sudo tee /etc/cron.d/blackglass-agent

set -euo pipefail

# ---------------------------------------------------------------------------
# Validate prerequisites
# ---------------------------------------------------------------------------
: "${BLACKGLASS_INGEST_URL:?BLACKGLASS_INGEST_URL must be set}"
: "${BLACKGLASS_API_KEY:?BLACKGLASS_API_KEY must be set}"

BLACKGLASS_HOST_ID="${BLACKGLASS_HOST_ID:-$(hostname -f 2>/dev/null || hostname)}"
BLACKGLASS_DRY_RUN="${BLACKGLASS_DRY_RUN:-0}"

# ---------------------------------------------------------------------------
# Collect checks (mirrors BUNDLE_CMD in src/lib/server/collector/ssh.ts)
# ---------------------------------------------------------------------------

collect_ss()         { ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo ""; }
collect_passwd()     { awk -F: '$3>=1000 && $3<65534 {print $1 ":" $3}' /etc/passwd 2>/dev/null || echo ""; }
collect_sudo()       { { getent group sudo 2>/dev/null || getent group wheel 2>/dev/null; } || echo ""; }
collect_sudofiles()  { sudo ls /etc/sudoers.d/ 2>/dev/null || echo ""; }
collect_cron()       { ls /etc/cron.d/ 2>/dev/null || echo ""; }
collect_svc()        { timeout 10 systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null || echo ""; }
collect_sshd()       { sudo /usr/sbin/sshd -T 2>/dev/null | grep -iE '^(permitrootlogin|passwordauthentication|permitemptypasswords|x11forwarding|allowtcpforwarding|allowagentforwarding|maxauthtries|port )' || echo ""; }
collect_ufw()        { sudo ufw status verbose 2>/dev/null || echo ""; }
collect_authkeys()   { awk -F: '$7~/bash|sh$/{print $1 ":" $6}' /etc/passwd | while IFS=: read u h; do f="$h/.ssh/authorized_keys"; [ -f "$f" ] && awk -v u="$u" '/^[^#]/{print u ":" $0}' "$f"; done 2>/dev/null || echo ""; }
collect_filehashes() { md5sum /etc/passwd /etc/shadow /etc/sudoers /etc/ssh/sshd_config /etc/hosts 2>/dev/null || echo ""; }
collect_hosts()      { cat /etc/hosts 2>/dev/null || echo ""; }
collect_lsmod()      { lsmod 2>/dev/null | awk 'NR>1{print $1}' | sort || echo ""; }
collect_suid()       { timeout 20 find /usr /bin /sbin /tmp /var/tmp -perm /6000 -type f 2>/dev/null | sort || echo ""; }
collect_usercron()   { ls /var/spool/cron/crontabs/ 2>/dev/null || echo ""; }

# ---------------------------------------------------------------------------
# JSON-encode a multiline string (escape backslash, quote, newline, tab, CR)
# ---------------------------------------------------------------------------
json_str() {
  local val
  val=$(printf '%s' "$1" \
    | sed 's/\\/\\\\/g; s/"/\\"/g; s/'"$(printf '\t')"'/\\t/g' \
    | awk '{printf "%s\\n", $0}')
  printf '"%s"' "${val%\\n}"
}

# ---------------------------------------------------------------------------
# Build JSON payload (matches IngestPayloadSchema)
# ---------------------------------------------------------------------------
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

SS=$(collect_ss)
PASSWD=$(collect_passwd)
SUDO=$(collect_sudo)
SUDOFILES=$(collect_sudofiles)
CRON=$(collect_cron)
SVC=$(collect_svc)
SSHD=$(collect_sshd)
UFW=$(collect_ufw)
AUTHKEYS=$(collect_authkeys)
FILEHASHES=$(collect_filehashes)
HOSTS_FILE=$(collect_hosts)
LSMOD=$(collect_lsmod)
SUID=$(collect_suid)
USERCRON=$(collect_usercron)

PAYLOAD=$(cat <<EOF
{
  "hostId": $(json_str "$BLACKGLASS_HOST_ID"),
  "hostname": $(json_str "$BLACKGLASS_HOST_ID"),
  "collectedAt": "$TIMESTAMP",
  "data": {
    "ss": $(json_str "$SS"),
    "passwd": $(json_str "$PASSWD"),
    "sudo": $(json_str "$SUDO"),
    "sudofiles": $(json_str "$SUDOFILES"),
    "cron": $(json_str "$CRON"),
    "svc": $(json_str "$SVC"),
    "sshd": $(json_str "$SSHD"),
    "ufw": $(json_str "$UFW"),
    "authkeys": $(json_str "$AUTHKEYS"),
    "filehashes": $(json_str "$FILEHASHES"),
    "hosts": $(json_str "$HOSTS_FILE"),
    "lsmod": $(json_str "$LSMOD"),
    "suid": $(json_str "$SUID"),
    "usercron": $(json_str "$USERCRON")
  }
}
EOF
)

# ---------------------------------------------------------------------------
# Send or dry-run
# ---------------------------------------------------------------------------
if [ "$BLACKGLASS_DRY_RUN" = "1" ]; then
  echo "[blackglass-agent] DRY RUN — payload:"
  echo "$PAYLOAD"
  exit 0
fi

HTTP_STATUS=$(curl -sSf \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BLACKGLASS_API_KEY" \
  --max-time 30 \
  -o /tmp/bgs-ingest-response.json \
  -w "%{http_code}" \
  "$BLACKGLASS_INGEST_URL" \
  --data-raw "$PAYLOAD") || true

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
  echo "[blackglass-agent] ingest OK (HTTP $HTTP_STATUS)"
else
  echo "[blackglass-agent] ingest FAILED (HTTP $HTTP_STATUS)" >&2
  cat /tmp/bgs-ingest-response.json >&2
  exit 1
fi
