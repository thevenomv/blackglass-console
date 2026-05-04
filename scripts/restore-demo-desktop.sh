#!/bin/bash
# Restores XFCE4 desktop + RustDesk client on the BLACKGLASS demo droplet.
# Relay (hbbs/hbbr) is assumed already running as systemd units.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

RELAY_IP="206.189.114.207"
RELAY_KEY="8FFJuTNp6R4mA3QgCGh2JB4wEoZ9uSnaBWcj85vipQ4="
RD_PASSWORD="Blackglass2026!"

log() { echo "[demo-setup $(date +%H:%M:%S)] $*" | tee -a /var/log/demo-setup.log; }

log "=== 1/6  System packages ==="
apt-get update -qq
apt-get install -y -qq xfce4 xfce4-terminal xvfb dbus-x11 ncat nmap unzip curl wget

log "=== 2/6  RustDesk client ==="
RD_VER=$(curl -fsSL https://api.github.com/repos/rustdesk/rustdesk/releases/latest \
    | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
log "Version: $RD_VER"
wget -q "https://github.com/rustdesk/rustdesk/releases/download/${RD_VER}/rustdesk-${RD_VER}-x86_64.deb" \
    -O /tmp/rustdesk.deb
apt-get install -y -qq /tmp/rustdesk.deb 2>/dev/null || \
    (apt-get install -f -y -qq && dpkg -i /tmp/rustdesk.deb)

log "=== 3/6  Configure RustDesk relay ==="
mkdir -p /root/.config/rustdesk
cat > /root/.config/rustdesk/RustDesk2.toml <<TOML
rendezvous_server = '${RELAY_IP}'
[options]
custom-rendezvous-server = '${RELAY_IP}'
relay-server = '${RELAY_IP}'
key = '${RELAY_KEY}'
TOML

log "=== 4/6  Systemd services ==="
cat > /etc/systemd/system/xvfb.service <<'UNIT'
[Unit]
Description=Virtual display :1
After=network.target
[Service]
ExecStart=/usr/bin/Xvfb :1 -screen 0 1280x800x24 -nolisten tcp
Restart=always
[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/xfce-desktop.service <<'UNIT'
[Unit]
Description=XFCE4 desktop on :1
After=xvfb.service
Requires=xvfb.service
[Service]
Environment=DISPLAY=:1
Environment=HOME=/root
ExecStart=/usr/bin/startxfce4
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/rustdesk-client.service <<'UNIT'
[Unit]
Description=RustDesk remote desktop daemon
After=xfce-desktop.service
[Service]
Environment=DISPLAY=:1
Environment=HOME=/root
ExecStartPre=/bin/sleep 10
ExecStart=/usr/bin/rustdesk --service
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable xvfb xfce-desktop rustdesk-client

log "=== 5/6  Start services ==="
systemctl restart xvfb
sleep 4
systemctl restart xfce-desktop
sleep 10
# Set password before starting daemon
rustdesk --password "${RD_PASSWORD}" 2>/dev/null || true
sleep 2
systemctl restart rustdesk-client
sleep 15

log "=== 6/6  Get RustDesk ID ==="
RD_ID=$(DISPLAY=:1 rustdesk --get-id 2>/dev/null || echo "NOT_READY_run_rustdesk_--get-id")

cat > /root/rustdesk-info.txt <<INFO
===================================================
  BLACKGLASS Demo Host — RustDesk Connection Details
===================================================
Host IP         : ${RELAY_IP}
RustDesk ID     : ${RD_ID}
Password        : ${RD_PASSWORD}
Server Key      : ${RELAY_KEY}
===================================================
Client config (Settings → Network → ID/Relay Server):
  ID Server   : ${RELAY_IP}
  Relay Server: ${RELAY_IP}
  Key         : ${RELAY_KEY}
===================================================
INFO

cat /root/rustdesk-info.txt
log "=== DONE ==="
