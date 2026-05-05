#!/bin/bash
# =============================================================
#  BLACKGLASS — Demo Reset
#  Reverses all 8 attack scenarios from full-demo.sh so the
#  demo VM is back to a clean baseline state.
#
#  Run ON the demo VM as root:
#    bash /root/demo/reset.sh
# =============================================================
set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[1;33m'
CYN='\033[0;36m'
BLD='\033[1m'
RST='\033[0m'

step() { echo -e "${CYN}[reset]${RST} $*"; }
ok()   { echo -e "  ${GRN}✓${RST} $*"; }
warn() { echo -e "  ${YEL}!${RST} $*"; }

echo -e "${BLD}"
echo "  ██████╗ ███████╗███████╗███████╗████████╗"
echo "  ██╔══██╗██╔════╝██╔════╝██╔════╝╚══██╔══╝"
echo "  ██████╔╝█████╗  ███████╗█████╗     ██║   "
echo "  ██╔══██╗██╔══╝  ╚════██║██╔══╝     ██║   "
echo "  ██║  ██║███████╗███████║███████╗   ██║   "
echo "  ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝   "
echo -e "${RST}"
echo -e "${BLD}  BLACKGLASS Demo VM — Reset to Clean State${RST}"
echo ""

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"; exit 1
fi

# ── SCENE 1 — Remove backdoor port listener ───────────────────
step "Scene 1 — Kill ncat listener on TCP 4444"
pkill -f 'ncat -lkp 4444' 2>/dev/null && ok "ncat process killed" || ok "no listener was running"

# ── SCENE 2 — Remove sudoers backdoor ────────────────────────
step "Scene 2 — Remove /etc/sudoers.d/demo-backdoor"
if [[ -f /etc/sudoers.d/demo-backdoor ]]; then
  rm -f /etc/sudoers.d/demo-backdoor
  ok "/etc/sudoers.d/demo-backdoor removed"
else
  ok "already gone"
fi

# Ensure collector sudo grant for ls /etc/sudoers.d is present
grep -qF 'NOPASSWD: /bin/ls /etc/sudoers.d' /etc/sudoers.d/blackglass-collector 2>/dev/null || \
  echo 'blackglass ALL=(root) NOPASSWD: /bin/ls /etc/sudoers.d' >> /etc/sudoers.d/blackglass-collector
ok "collector sudoers grant for ls /etc/sudoers.d ensured"

# ── SCENE 3 + 4 — Remove rogue user ──────────────────────────
step "Scene 3/4 — Remove user 'attacker-ssh'"
if id attacker-ssh &>/dev/null; then
  gpasswd -d attacker-ssh sudo 2>/dev/null || true
  userdel -r attacker-ssh 2>/dev/null || true
  ok "user 'attacker-ssh' deleted"
else
  ok "user was not present"
fi

# ── SCENE 5 — Remove cron persistence ────────────────────────
step "Scene 5 — Remove /etc/cron.d/demo-persistence"
if [[ -f /etc/cron.d/demo-persistence ]]; then
  rm -f /etc/cron.d/demo-persistence
  ok "/etc/cron.d/demo-persistence removed"
else
  ok "already gone"
fi

# ── SCENE 6 — Remove demo-beacon service ─────────────────────
step "Scene 6 — Remove demo-beacon.service"
if [ -f /etc/systemd/system/demo-beacon.service ]; then
  systemctl stop  demo-beacon 2>/dev/null || true
  systemctl disable demo-beacon 2>/dev/null || true
  rm -f /etc/systemd/system/demo-beacon.service
  systemctl daemon-reload
  ok "demo-beacon.service removed"
else
  ok "service was not present"
fi

# ── SCENE 7 — Restore SSH hardening ──────────────────────────
step "Scene 7 — Restore PermitRootLogin prohibit-password in sshd_config"
if grep -q '^PermitRootLogin yes' /etc/ssh/sshd_config; then
  sed -i 's/^PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  ok "PermitRootLogin restored to prohibit-password"
else
  ok "PermitRootLogin was already correct: $(grep '^PermitRootLogin' /etc/ssh/sshd_config || echo 'default')"
fi

# ── SCENE 8 — Remove firewall hole ───────────────────────────
step "Scene 8 — Remove ufw rule for port 8080"
if ufw status | grep -q '8080'; then
  ufw delete allow 8080/tcp 2>/dev/null || true
  ok "ufw rule for 8080 removed"
else
  ok "rule was not present"
fi

echo ""
echo -e "${CYN}============================================================${RST}"
echo -e "${CYN}  RESET COMPLETE — demo VM is clean${RST}"
echo -e "${CYN}============================================================${RST}"
echo ""
echo -e "  ${YEL}Capture a fresh baseline in BLACKGLASS before the next demo run.${RST}"
echo ""
