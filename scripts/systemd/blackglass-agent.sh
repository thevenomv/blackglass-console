#!/usr/bin/env bash
# blackglass-agent.sh — BLACKGLASS push-ingest agent (raw bundle mode)
#
# Runs the SAME 14-section collection script that the BLACKGLASS server-side SSH
# collector runs over `ssh exec`, captures stdout, and POSTs it to
# /api/v1/ingest/agent. The server runs the exact same parsers it would have
# run on SSH-collected output, so the resulting HostSnapshot is byte-identical
# — meaning every dashboard, drift engine, and evidence bundle works unchanged.
#
# Why push? DigitalOcean's App Platform silently blackholes egress to other
# user-owned Droplets (both public + private VPC), so the SSH/pull model is not
# viable for App-Platform-hosted BLACKGLASS instances scanning DO Droplets.
#
# REQUIRED env (typically loaded from /etc/blackglass-agent.env):
#   BLACKGLASS_INGEST_URL   — full URL, e.g. https://blackglasssec.com/api/v1/ingest/agent
#   BLACKGLASS_API_KEY      — Bearer secret matching INGEST_API_KEY (or the per-host secret in INGEST_HOST_KEYS_JSON)
#
# OPTIONAL env:
#   BLACKGLASS_HOST_ID      — overrides the auto-derived hostId (default: "host-<ip-with-dashes>" or "host-<hostname>")
#   BLACKGLASS_HOSTNAME     — overrides the displayed hostname (default: `hostname -f`)
#   BLACKGLASS_DRY_RUN      — "1" to print payload + exit without sending
#   BLACKGLASS_DEBUG        — "1" to print verbose timing + curl info
#
# One-shot install (typical):
#   sudo curl -sSL https://raw.githubusercontent.com/<org>/<repo>/main/scripts/blackglass-agent.sh \
#       -o /usr/local/bin/blackglass-agent.sh
#   sudo chmod +x /usr/local/bin/blackglass-agent.sh
#   sudo install -m 0600 /dev/stdin /etc/blackglass-agent.env <<EOF
#   BLACKGLASS_INGEST_URL=https://blackglasssec.com/api/v1/ingest/agent
#   BLACKGLASS_API_KEY=...
#   BLACKGLASS_HOST_ID=host-<your-id>
#   EOF
#   # see scripts/blackglass-agent.service / .timer for the systemd units

set -euo pipefail

# ---------------------------------------------------------------------------
# Mode flags
# ---------------------------------------------------------------------------
#   --check    Pre-flight only: validates dependencies, network reachability,
#              and that the bundle script collects all 17 expected sections.
#              Never POSTs. Used by the installer before declaring success
#              and by ops for triage. Exits 0 if everything is green.
#
# Otherwise: collect bundle and POST to BLACKGLASS_INGEST_URL.
# ---------------------------------------------------------------------------
MODE="run"
if [ "${1:-}" = "--check" ]; then
  MODE="check"
fi

: "${BLACKGLASS_INGEST_URL:?BLACKGLASS_INGEST_URL must be set}"
: "${BLACKGLASS_API_KEY:?BLACKGLASS_API_KEY must be set}"

# Default hostId follows the same shape the SSH collector synthesises:
# host-<ip-with-dots-as-dashes>. Falls back to hostname-derived id when no
# default route is configured.
default_host_id() {
  local ip
  ip=$(ip route get 1.1.1.1 2>/dev/null | awk '/src/{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -n1)
  if [ -n "$ip" ]; then
    printf 'host-%s' "${ip//./-}"
  else
    printf 'host-%s' "$(hostname | tr '.' '-')"
  fi
}

BLACKGLASS_HOST_ID="${BLACKGLASS_HOST_ID:-$(default_host_id)}"
BLACKGLASS_HOSTNAME="${BLACKGLASS_HOSTNAME:-$(hostname -f 2>/dev/null || hostname)}"
BLACKGLASS_DRY_RUN="${BLACKGLASS_DRY_RUN:-0}"
BLACKGLASS_DEBUG="${BLACKGLASS_DEBUG:-0}"

log() { printf '[blackglass-agent] %s\n' "$*"; }
dbg() { [ "$BLACKGLASS_DEBUG" = "1" ] && printf '[blackglass-agent][debug] %s\n' "$*"; return 0; }

# ---------------------------------------------------------------------------
# BUNDLE_CMD — IDENTICAL to BUNDLE_CMD in src/lib/server/collector/ssh.ts.
# Keep both copies in sync; the server parser splits on `=BGS:<key>` lines.
# ---------------------------------------------------------------------------
BUNDLE_CMD=$(cat <<'BGSCMD'
echo '=BGS:ss'
ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null
echo '=BGS:ssudp'
ss -ulnp 2>/dev/null || netstat -ulnp 2>/dev/null
echo '=BGS:passwd'
awk -F: '$3>=1000 && $3<65534 {print $1 ":" $3}' /etc/passwd 2>/dev/null
echo '=BGS:sudo'
getent group sudo 2>/dev/null || getent group wheel 2>/dev/null
echo '=BGS:sudofiles'
sudo ls /etc/sudoers.d/ 2>/dev/null
echo '=BGS:cron'
ls /etc/cron.d/ 2>/dev/null
echo '=BGS:svc'
timeout 10 systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null
echo '=BGS:sshd'
sudo /usr/sbin/sshd -T 2>/dev/null | grep -iE '^(permitrootlogin|passwordauthentication|permitemptypasswords|x11forwarding|allowtcpforwarding|allowagentforwarding|maxauthtries|port )'
echo '=BGS:ufw'
sudo ufw status verbose 2>/dev/null
echo '=BGS:authkeys'
awk -F: '$7~/bash|sh$/{print $1 ":" $6}' /etc/passwd | while IFS=: read u h; do f="$h/.ssh/authorized_keys"; [ -f "$f" ] && awk -v u="$u" '/^[^#]/{print u ":" $0}' "$f"; done 2>/dev/null
echo '=BGS:filehashes'
md5sum /etc/passwd /etc/shadow /etc/sudoers /etc/ssh/sshd_config /etc/hosts 2>/dev/null
echo '=BGS:hosts'
cat /etc/hosts 2>/dev/null
echo '=BGS:lsmod'
lsmod 2>/dev/null | awk 'NR>1{print $1}' | sort
echo '=BGS:suid'
timeout 20 find /usr /bin /sbin /tmp /var/tmp -perm /6000 -type f 2>/dev/null | sort
echo '=BGS:usercron'
ls /var/spool/cron/crontabs/ 2>/dev/null
echo '=BGS:pkgs'
if command -v dpkg-query >/dev/null 2>&1; then dpkg -l 2>/dev/null | tail -n +6; elif command -v rpm >/dev/null 2>&1; then rpm -qa --qf '%{NAME}|%{VERSION}-%{RELEASE}\n' 2>/dev/null; fi
echo '=BGS:systemdunits'
find /etc/systemd/system -maxdepth 3 \( -type f -o -type l \) \( -name '*.service' -o -name '*.timer' -o -name '*.socket' -o -name '*.path' -o -name '*.mount' \) 2>/dev/null | sort
BGSCMD
)

# ---------------------------------------------------------------------------
# Collect bundle (60s hard ceiling, mirroring BUNDLE_EXEC_TIMEOUT_MS)
# ---------------------------------------------------------------------------
TS_START=$(date +%s)
BUNDLE_FILE=$(mktemp -t bgs-bundle.XXXXXX)
trap 'rm -f "$BUNDLE_FILE" "$PAYLOAD_FILE" "$RESPONSE_FILE" 2>/dev/null || true' EXIT

if ! timeout 60 bash -c "$BUNDLE_CMD" >"$BUNDLE_FILE" 2>/dev/null; then
  log "WARN: bundle script returned non-zero (continuing with partial output)"
fi
BUNDLE_BYTES=$(wc -c <"$BUNDLE_FILE" | tr -d ' ')
dbg "collected ${BUNDLE_BYTES} bytes in $(( $(date +%s) - TS_START ))s"

if [ "$BUNDLE_BYTES" -lt 100 ]; then
  log "ERROR: bundle is suspiciously small (${BUNDLE_BYTES} bytes); aborting"
  exit 2
fi

# ---------------------------------------------------------------------------
# --check mode — validate without POSTing.
# ---------------------------------------------------------------------------
if [ "$MODE" = "check" ]; then
  log "--check mode: validating environment..."

  # 1. Required commands
  for cmd in curl awk grep sort tr; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      log "FAIL: missing required command: $cmd"
      exit 4
    fi
  done
  if ! command -v python3 >/dev/null 2>&1 && ! command -v jq >/dev/null 2>&1; then
    log "FAIL: neither python3 nor jq is installed (need one for JSON encoding)"
    exit 4
  fi
  log "OK: required commands present"

  # 2. DNS / TCP reachability of the ingest URL (HEAD request, expect any
  #    HTTP response — even 405 method-not-allowed proves we got there).
  CHECK_HOST=$(printf '%s' "$BLACKGLASS_INGEST_URL" | awk -F[/:] '{print $4}')
  if [ -z "$CHECK_HOST" ]; then
    log "FAIL: cannot parse host from BLACKGLASS_INGEST_URL ($BLACKGLASS_INGEST_URL)"
    exit 4
  fi
  if ! getent hosts "$CHECK_HOST" >/dev/null 2>&1; then
    log "FAIL: DNS lookup failed for $CHECK_HOST"
    exit 4
  fi
  log "OK: DNS resolves $CHECK_HOST"

  HTTP_PROBE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer probe" \
    -H "Content-Type: application/json" \
    -X POST -d '{}' "$BLACKGLASS_INGEST_URL" || echo "000")
  case "$HTTP_PROBE" in
    400|401|403|422)
      log "OK: ingest endpoint reachable (HTTP $HTTP_PROBE — expected for empty/probe payload)"
      ;;
    000)
      log "FAIL: ingest endpoint unreachable (network error / TLS failure)"
      exit 4
      ;;
    *)
      log "WARN: ingest endpoint returned unexpected HTTP $HTTP_PROBE — continuing"
      ;;
  esac

  # 3. Bundle section coverage. We split on =BGS: markers and confirm
  #    each of the 17 sections is present (some may be empty, which is
  #    fine — `ufw` on hosts without UFW for example).
  EXPECTED_SECTIONS="ss ssudp passwd sudo sudofiles cron usercron svc sshd ufw authkeys filehashes hosts lsmod suid pkgs systemdunits"
  MISSING=""
  for section in $EXPECTED_SECTIONS; do
    if ! grep -q "^=BGS:${section}$" "$BUNDLE_FILE"; then
      MISSING="$MISSING $section"
    fi
  done
  if [ -n "$MISSING" ]; then
    log "WARN: bundle missing sections:$MISSING (the agent will still POST but expect drift coverage gaps)"
  else
    log "OK: bundle has all 17 expected sections (${BUNDLE_BYTES} bytes)"
  fi

  log "--check complete (no push performed)."
  exit 0
fi

# ---------------------------------------------------------------------------
# Build JSON payload. Use python3 for safe JSON encoding of the raw bundle
# (it's the only stdlib-available reliable JSON encoder on a stock Ubuntu
# Droplet — sed-based encoding is too fragile for arbitrary command output).
# ---------------------------------------------------------------------------
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PAYLOAD_FILE=$(mktemp -t bgs-payload.XXXXXX.json)

if command -v python3 >/dev/null 2>&1; then
  python3 - "$PAYLOAD_FILE" "$BUNDLE_FILE" "$BLACKGLASS_HOST_ID" "$BLACKGLASS_HOSTNAME" "$TIMESTAMP" <<'PY'
import json, sys
out, bundle_path, host_id, hostname, ts = sys.argv[1:6]
with open(bundle_path, "r", encoding="utf-8", errors="replace") as f:
    bundle = f.read()
with open(out, "w", encoding="utf-8") as f:
    json.dump({
        "hostId": host_id,
        "hostname": hostname,
        "collectedAt": ts,
        "bundle": bundle,
    }, f)
PY
elif command -v jq >/dev/null 2>&1; then
  jq -n \
    --arg hostId "$BLACKGLASS_HOST_ID" \
    --arg hostname "$BLACKGLASS_HOSTNAME" \
    --arg collectedAt "$TIMESTAMP" \
    --rawfile bundle "$BUNDLE_FILE" \
    '{hostId:$hostId,hostname:$hostname,collectedAt:$collectedAt,bundle:$bundle}' \
    >"$PAYLOAD_FILE"
else
  log "ERROR: neither python3 nor jq is installed; cannot encode JSON safely"
  exit 3
fi

PAYLOAD_BYTES=$(wc -c <"$PAYLOAD_FILE" | tr -d ' ')
dbg "encoded payload: ${PAYLOAD_BYTES} bytes"

if [ "$BLACKGLASS_DRY_RUN" = "1" ]; then
  log "DRY RUN — payload (${PAYLOAD_BYTES} bytes):"
  cat "$PAYLOAD_FILE"
  echo
  exit 0
fi

# ---------------------------------------------------------------------------
# POST. --data-binary @file avoids argv-length limits and preserves bytes.
# ---------------------------------------------------------------------------
RESPONSE_FILE=$(mktemp -t bgs-response.XXXXXX.json)
HTTP_STATUS=$(curl -sS \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BLACKGLASS_API_KEY" \
  --max-time 30 \
  -o "$RESPONSE_FILE" \
  -w "%{http_code}" \
  --data-binary "@$PAYLOAD_FILE" \
  "$BLACKGLASS_INGEST_URL") || HTTP_STATUS="000"

case "$HTTP_STATUS" in
  200|201)
    log "ingest OK (HTTP $HTTP_STATUS, host=$BLACKGLASS_HOST_ID, bundle=${BUNDLE_BYTES}B)"
    [ "$BLACKGLASS_DEBUG" = "1" ] && cat "$RESPONSE_FILE" && echo
    exit 0
    ;;
  *)
    log "ERROR: ingest FAILED (HTTP $HTTP_STATUS, host=$BLACKGLASS_HOST_ID)"
    cat "$RESPONSE_FILE" >&2
    echo >&2
    exit 1
    ;;
esac
