/**
 * GET /install-agent.sh
 *
 * Returns a self-contained bash installer for the BLACKGLASS push-agent.
 *
 * This is the canonical "first baseline" entry point. The user runs:
 *
 *   curl -fsSL https://blackglasssec.com/install-agent.sh \
 *     | BLACKGLASS_KEY=<their-api-key> bash
 *
 * and the installer:
 *   1. Detects OS family (apt/dpkg vs rpm/dnf vs other) and installs
 *      `python3` + `curl` if missing.
 *   2. Creates the `blackglass` system user.
 *   3. Drops `/usr/local/bin/blackglass-agent.sh` (the bundle agent — the
 *      same script that ships in `scripts/blackglass-agent.sh`, embedded
 *      here so the installer is hermetic and survives a server reboot
 *      mid-install).
 *   4. Writes `/etc/blackglass-agent.env` (mode 0600) with the user's
 *      API key, the console ingest URL (derived from the request host
 *      so we don't hard-code a domain), and a default hostId.
 *   5. Installs + enables the systemd service + 60-second timer (or falls
 *      back to cron when systemd isn't available).
 *   6. Runs ONE push synchronously and parses the response so we can
 *      report a specific success or failure, not just "good luck".
 *
 * Security:
 *   - The API key is supplied via env var, never via URL query (URLs
 *     end up in proxy logs, env vars do not).
 *   - The endpoint is unauthenticated by design — the install script
 *     is public, the API key gates ingestion. This is the same model
 *     curl-pipe-bash installers from Tailscale, Datadog, etc. use.
 *   - We DO NOT bake the API key into the script itself; the user
 *     pastes it at runtime so a leaked installer URL is harmless.
 *
 * The route is at the path `/install-agent.sh` (not under `/api/v1/`)
 * because curl|bash users expect a clean URL and because we historically
 * advertised this URL in marketing.
 */

import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { isHostTombstoned, clearTombstone } from "@/lib/server/host-tombstones";
import { tryNormaliseHostId } from "@/lib/server/onboarding/host-id";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Window inside which a fresh hit on /install-agent.sh for a tombstoned
 * host is treated as user-driven retry — the user just deleted the host
 * and is now reinstalling. We auto-clear the tombstone so the agent's
 * first push isn't immediately rejected with a 410.
 *
 * 10 minutes balances "long enough that a real human can re-run an
 * install command" against "short enough that a stale install URL
 * doesn't undo a deletion that was an hour ago".
 */
const TOMBSTONE_AUTO_CLEAR_WINDOW_MS = 10 * 60 * 1000;

/** Read and cache the canonical agent script from disk. */
let cachedAgentScript: string | null = null;
async function readAgentScript(): Promise<string> {
  if (cachedAgentScript) return cachedAgentScript;
  const p = path.join(process.cwd(), "scripts", "blackglass-agent.sh");
  cachedAgentScript = await fs.readFile(p, "utf8");
  return cachedAgentScript;
}

/**
 * Resolve the absolute console URL we should bake into the env file.
 * Priority: NEXT_PUBLIC_APP_URL env (set in production), then the
 * request host header (works for staging / preview deploys), then a
 * sensible default.
 */
function resolveIngestUrl(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "") + "/api/v1/ingest/agent";
  const headerHost = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (headerHost) return `${proto}://${headerHost}/api/v1/ingest/agent`;
  return "https://blackglasssec.com/api/v1/ingest/agent";
}

function resolveConsoleUrl(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  const headerHost = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (headerHost) return `${proto}://${headerHost}`;
  return "https://blackglasssec.com";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ingestUrl = resolveIngestUrl(request);
  const consoleUrl = resolveConsoleUrl(request);
  const rawHostHint = url.searchParams.get("host")?.trim() || "";
  // Normalise so the tombstone lookup works against the canonical
  // hostId. The bash script also normalises on the host side.
  const hostHint = rawHostHint ? tryNormaliseHostId(rawHostHint) ?? "" : "";
  const agentScript = await readAgentScript();

  // Auto-clear tombstones inside the retry window. This means a user
  // who just deleted a host and is now re-running the install command
  // doesn't have to wait for a tenant admin to clear the tombstone.
  if (hostHint) {
    try {
      const ingestTenantId = process.env.INGEST_SAAS_TENANT_ID?.trim() ?? null;
      const tombstone = await isHostTombstoned(hostHint, ingestTenantId);
      if (tombstone) {
        const expiresAtMs = Date.parse(tombstone.expiresAt);
        // Tombstones default to 24h TTL. We treat one as "fresh" when
        // (24h - 10min) < createdAt, i.e. its remaining TTL is within
        // 10 minutes of the full window.
        const ttlHours = Number(process.env.HOST_TOMBSTONE_TTL_HOURS ?? 24);
        const createdAtMs = expiresAtMs - ttlHours * 60 * 60 * 1000;
        const ageMs = Date.now() - createdAtMs;
        if (ageMs < TOMBSTONE_AUTO_CLEAR_WINDOW_MS) {
          const cleared = await clearTombstone(hostHint, ingestTenantId);
          if (cleared) {
            appendAudit({
              action: AUDIT_ACTIONS.HOST_DELETED,
              detail: `tombstone_auto_cleared — host=${hostHint} ageMs=${ageMs} (install URL hit within retry window)`,
              actor: "installer",
            });
          }
        }
      }
    } catch (err) {
      // Best-effort. The agent's first push will surface a more
      // specific error if the tombstone really is still in force.
      console.error("[install-agent.sh] tombstone auto-clear failed:", err);
    }
  }

  // ------------------------------------------------------------------
  // Bash installer template.
  //
  // We keep the agent script as a single heredoc. To make sure the
  // user's BLACKGLASS_KEY (which can contain anything) is never
  // interpolated by the shell at install time, we write the env file
  // via printf with quoted args.
  //
  // Exit codes:
  //   0  installed AND first push succeeded
  //   1  bad arguments / missing prerequisites
  //   2  agent script execution failed (parse / write / systemd)
  //   3  first push HTTP failure (key rejected, host quota, etc.)
  // ------------------------------------------------------------------

  const installer = `#!/usr/bin/env bash
# BLACKGLASS push-agent installer
# Generated by ${consoleUrl}/install-agent.sh
# Usage:
#   curl -fsSL ${consoleUrl}/install-agent.sh | BLACKGLASS_KEY=<key> bash
#
# Optional env:
#   BLACKGLASS_HOST_ID     Override the auto-derived hostId (default: host-<ip-with-dashes>)
#   BLACKGLASS_HOSTNAME    Override the displayed hostname (default: $(hostname -f))
#   BLACKGLASS_INGEST_URL  Override the console ingest URL (default: ${ingestUrl})

set -euo pipefail

INGEST_URL_DEFAULT="${ingestUrl}"
CONSOLE_URL="${consoleUrl}"
HOST_HINT=${JSON.stringify(hostHint)}

# ---------- output helpers ------------------------------------------------
RED=$'\\033[0;31m'; GREEN=$'\\033[0;32m'; YELLOW=$'\\033[1;33m'; CYAN=$'\\033[0;36m'; NC=$'\\033[0m'
info()    { printf '%s[blackglass]%s %s\\n' "$GREEN" "$NC" "$*"; }
step()    { printf '%s[blackglass]%s %s\\n' "$CYAN" "$NC" "$*"; }
warn()    { printf '%s[blackglass]%s %s\\n' "$YELLOW" "$NC" "$*" >&2; }
fatal()   { printf '%s[blackglass] ERROR:%s %s\\n' "$RED" "$NC" "$*" >&2; exit 1; }
remedy()  { printf '%s              remedy:%s %s\\n' "$YELLOW" "$NC" "$*" >&2; }

# ---------- pre-flight ----------------------------------------------------
[ "\${EUID:-$(id -u)}" -eq 0 ] || fatal "Run as root (use sudo)."
[ -n "\${BLACKGLASS_KEY:-}" ] || {
  fatal "BLACKGLASS_KEY env var is required."
  remedy "Re-run as: curl -fsSL $CONSOLE_URL/install-agent.sh | BLACKGLASS_KEY=<key> bash"
  exit 1
}

INGEST_URL="\${BLACKGLASS_INGEST_URL:-$INGEST_URL_DEFAULT}"

# ---------- 1. install missing system packages ----------------------------
ensure_pkg() {
  command -v "$1" >/dev/null 2>&1 && return 0
  if command -v apt-get >/dev/null 2>&1; then
    step "Installing $1 via apt..."
    apt-get update -qq >/dev/null 2>&1 || true
    apt-get install -y -qq "$1" >/dev/null 2>&1 || fatal "apt-get install $1 failed"
  elif command -v dnf >/dev/null 2>&1; then
    step "Installing $1 via dnf..."
    dnf install -y -q "$1" >/dev/null 2>&1 || fatal "dnf install $1 failed"
  elif command -v yum >/dev/null 2>&1; then
    step "Installing $1 via yum..."
    yum install -y -q "$1" >/dev/null 2>&1 || fatal "yum install $1 failed"
  else
    fatal "$1 is required but no supported package manager (apt/dnf/yum) was found."
  fi
}

ensure_pkg curl
ensure_pkg python3

# ---------- 2. create blackglass system user ------------------------------
# Shell is /bin/bash (not /usr/sbin/nologin) so cron jobs and sudo can run
# as this user. The user has no password, no SSH keys, and no sudo by default.
if ! id -u blackglass >/dev/null 2>&1; then
  step "Creating system user 'blackglass'..."
  useradd --system --create-home --shell /bin/bash blackglass
fi

# ---------- 3. drop the agent script --------------------------------------
AGENT_BIN="/usr/local/bin/blackglass-agent.sh"
step "Installing agent at $AGENT_BIN..."
cat > "$AGENT_BIN" <<'BLACKGLASS_AGENT_SH_EOF'
${agentScript}
BLACKGLASS_AGENT_SH_EOF
chmod 0755 "$AGENT_BIN"

# ---------- 4. derive hostId ---------------------------------------------
derive_host_id() {
  if [ -n "\${BLACKGLASS_HOST_ID:-}" ]; then
    printf '%s' "$BLACKGLASS_HOST_ID"
    return
  fi
  if [ -n "$HOST_HINT" ]; then
    printf '%s' "$HOST_HINT"
    return
  fi
  local ip
  ip=$(ip route get 1.1.1.1 2>/dev/null | awk '/src/{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -n1)
  if [ -n "$ip" ]; then
    printf 'host-%s' "\${ip//./-}"
  else
    printf 'host-%s' "$(hostname -s | tr '.' '-')"
  fi
}

DERIVED_HOST_ID=$(derive_host_id)
DERIVED_HOSTNAME=\${BLACKGLASS_HOSTNAME:-$(hostname -f 2>/dev/null || hostname)}

# ---------- 5. env file ---------------------------------------------------
ENV_FILE="/etc/blackglass-agent.env"
step "Writing $ENV_FILE..."
umask 077
{
  printf 'BLACKGLASS_INGEST_URL=%s\\n' "$INGEST_URL"
  printf 'BLACKGLASS_API_KEY=%s\\n' "$BLACKGLASS_KEY"
  printf 'BLACKGLASS_HOST_ID=%s\\n' "$DERIVED_HOST_ID"
  printf 'BLACKGLASS_HOSTNAME=%s\\n' "$DERIVED_HOSTNAME"
} > "$ENV_FILE"
chmod 0600 "$ENV_FILE"
chown root:root "$ENV_FILE"

# ---------- 6. systemd unit + timer (or cron fallback) -------------------
if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  step "Installing systemd service + timer..."
  cat > /etc/systemd/system/blackglass-agent.service <<'EOF'
[Unit]
Description=BLACKGLASS push-ingest agent (one-shot collection + POST)
Documentation=https://blackglasssec.com/security#push-agent
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/blackglass-agent.env
ExecStart=/usr/local/bin/blackglass-agent.sh
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadOnlyPaths=/etc /usr /var
ProtectHome=read-only
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictRealtime=true
LockPersonality=true
EOF
  cat > /etc/systemd/system/blackglass-agent.timer <<'EOF'
[Unit]
Description=Run BLACKGLASS push-ingest agent every 60 seconds

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=5s
RandomizedDelaySec=10s
Persistent=true
Unit=blackglass-agent.service

[Install]
WantedBy=timers.target
EOF

  # ---------- wake-check: 10-second poller for force-push requests ----------
  # Operators can request an immediate snapshot via
  #   POST /api/v1/hosts/:id/wake
  # which sets a TTL'd flag in the console. The wake-check service polls
  # GET /api/v1/agent/wake?hostId=... every 10s; when the flag is set it
  # triggers blackglass-agent.service for a sub-15s push instead of
  # waiting up to a minute for the regular timer tick. Failing safe: if
  # the wake endpoint is unreachable (offline console, network blip) we
  # silently no-op — the regular 60s timer still runs.
  cat > /usr/local/bin/blackglass-agent-wake.sh <<'BLACKGLASS_WAKE_SH_EOF'
#!/usr/bin/env bash
set -euo pipefail
. /etc/blackglass-agent.env
WAKE_URL="\${BLACKGLASS_INGEST_URL%/api/v1/ingest/agent}/api/v1/agent/wake?hostId=\${BLACKGLASS_HOST_ID}"
RESP=$(curl -sS --max-time 5 -H "Authorization: Bearer \${BLACKGLASS_API_KEY}" "$WAKE_URL" 2>/dev/null || echo '{"wake":false}')
if printf '%s' "$RESP" | grep -qE '"wake"[[:space:]]*:[[:space:]]*true'; then
  exec systemctl start blackglass-agent.service
fi
BLACKGLASS_WAKE_SH_EOF
  chmod 0755 /usr/local/bin/blackglass-agent-wake.sh

  cat > /etc/systemd/system/blackglass-agent-wake.service <<'EOF'
[Unit]
Description=BLACKGLASS wake-check (poll for operator force-push)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/blackglass-agent.env
ExecStart=/usr/local/bin/blackglass-agent-wake.sh
NoNewPrivileges=true
PrivateTmp=true
EOF
  cat > /etc/systemd/system/blackglass-agent-wake.timer <<'EOF'
[Unit]
Description=Poll BLACKGLASS console for force-push requests every 10 seconds

[Timer]
OnBootSec=45s
OnUnitActiveSec=10s
AccuracySec=2s
Unit=blackglass-agent-wake.service

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now blackglass-agent.timer >/dev/null 2>&1 || warn "systemctl enable failed"
  systemctl enable --now blackglass-agent-wake.timer >/dev/null 2>&1 || warn "systemctl enable wake timer failed"
  info "Systemd timers enabled (60s push + 10s wake-check)."
else
  # Cron's minimum granularity is 1 minute — match the systemd path.
  step "systemd not detected; installing cron job (every minute)..."
  ( crontab -l 2>/dev/null | grep -v 'blackglass-agent\\.sh' ; \
    printf '* * * * * /usr/local/bin/blackglass-agent.sh >> /var/log/blackglass-agent.log 2>&1\\n' \
  ) | crontab -
fi

# ---------- 7. first synchronous push -------------------------------------
step "Running first snapshot push (sync)..."
RESPONSE_FILE=$(mktemp -t bgs-install.XXXXXX.json)
trap 'rm -f "$RESPONSE_FILE" 2>/dev/null || true' EXIT

if RESPONSE=$(/usr/local/bin/blackglass-agent.sh 2>&1); then
  printf '%s' "$RESPONSE" > "$RESPONSE_FILE"
  HOST_ID="$DERIVED_HOST_ID"
  HOST_URL="$CONSOLE_URL/hosts/$HOST_ID"
  echo
  info "DONE."
  info "Host ID:        $HOST_ID"
  info "Console URL:    $HOST_URL"
  info "Next snapshot:  $(date -u -d '+1 minute' '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || echo 'in ~60 seconds')"
  echo
  info "Open the wizard to capture your baseline:"
  info "  $CONSOLE_URL/onboarding"
  exit 0
else
  rc=$?
  echo
  warn "First snapshot FAILED (exit $rc)."
  echo "$RESPONSE" >&2
  remedy "Check '/etc/blackglass-agent.env' (key, ingest URL) and re-run:"
  remedy "  sudo /usr/local/bin/blackglass-agent.sh"
  remedy "If the error mentions 'host_quota_exceeded' or 'host_tombstoned',"
  remedy "open $CONSOLE_URL/onboarding and click 'Reset and reinstall'."
  exit 3
fi
`;

  return new NextResponse(installer, {
    status: 200,
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      // Defence-in-depth: shells will execute regardless, but make it
      // explicit that this isn't HTML and shouldn't be embedded.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
