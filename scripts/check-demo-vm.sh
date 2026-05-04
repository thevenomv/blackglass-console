#!/usr/bin/env bash
# =============================================================
#  BLACKGLASS — Pre-demo health check
#  Run ON the demo VM as root before every demo session.
#  Confirms all services are up and prints the RustDesk ID.
#  Usage: bash /root/demo/check.sh
# =============================================================
set -euo pipefail

GRN='\033[0;32m'
RED='\033[0;31m'
YEL='\033[1;33m'
CYN='\033[0;36m'
BLD='\033[1m'
RST='\033[0m'

ok()   { echo -e "  ${GRN}[OK]${RST}   $*"; }
fail() { echo -e "  ${RED}[FAIL]${RST} $*"; FAILED=1; }
warn() { echo -e "  ${YEL}[WARN]${RST} $*"; }

FAILED=0

echo ""
echo -e "${CYN}${BLD}  BLACKGLASS Demo VM — Pre-Demo Health Check${RST}"
echo -e "${CYN}  ============================================${RST}"
echo ""

# ── Services ──────────────────────────────────────────────────
echo -e "${BLD}  Services:${RST}"
for svc in xvfb xfce-desktop rustdesk-client; do
  if systemctl is-active --quiet "$svc"; then
    ok "$svc is running"
  else
    fail "$svc is NOT running — attempting restart..."
    systemctl restart "$svc" && ok "$svc restarted OK" || fail "$svc failed to restart"
  fi
done

# ── RustDesk ID ───────────────────────────────────────────────
echo ""
echo -e "${BLD}  RustDesk:${RST}"
RD_ID=$(DISPLAY=:1 rustdesk --get-id 2>/dev/null || echo "")
if [[ -n "$RD_ID" ]]; then
  ok "Peer ID: ${BLD}${RD_ID}${RST}"
else
  warn "Peer ID not ready — wait 10s and run check.sh again"
  FAILED=1
fi

# ── Demo scripts ──────────────────────────────────────────────
echo ""
echo -e "${BLD}  Demo scripts (/root/demo/):${RST}"
for f in full-demo.sh reset.sh; do
  if [[ -x "/root/demo/$f" ]]; then
    ok "/root/demo/$f present and executable"
  else
    fail "/root/demo/$f missing — re-run deploy-demo-scripts.ps1 from Windows"
    FAILED=1
  fi
done

# ── Desktop icons ─────────────────────────────────────────────
echo ""
echo -e "${BLD}  Desktop icons (/root/Desktop/):${RST}"
for f in blackglass-run-demo.desktop blackglass-reset-demo.desktop; do
  if [[ -f "/root/Desktop/$f" ]]; then
    ok "$f present"
  else
    warn "$f missing — run: bash /root/demo/setup-demo-icons.sh"
  fi
done

# ── Required tools ────────────────────────────────────────────
echo ""
echo -e "${BLD}  Required tools:${RST}"
for tool in ncat nmap useradd ufw systemctl; do
  if command -v "$tool" &>/dev/null; then
    ok "$tool found"
  else
    fail "$tool missing — run: apt-get install -y ncat nmap"
    FAILED=1
  fi
done

# ── Result ────────────────────────────────────────────────────
echo ""
echo -e "${CYN}  ============================================${RST}"
if [[ $FAILED -eq 0 ]]; then
  echo -e "  ${GRN}${BLD}All checks passed. Ready to demo.${RST}"
  echo ""
  echo -e "  ${BLD}RustDesk ID:${RST} ${RD_ID}"
  echo -e "  ${BLD}Password:${RST}    check /root/rustdesk-info.txt"
  echo ""
  echo -e "  ${YEL}Next: capture a clean baseline in BLACKGLASS, then double-click${RST}"
  echo -e "  ${YEL}'Run BLACKGLASS Demo' on the desktop.${RST}"
else
  echo -e "  ${RED}${BLD}Some checks failed — fix the issues above before demoing.${RST}"
fi
echo ""
