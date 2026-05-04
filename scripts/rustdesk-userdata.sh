#!/bin/bash
# ============================================================
# BLACKGLASS + RustDesk Demo Droplet  —  cloud-init user-data
# Paste this into "User Data" when creating the droplet in
# the DigitalOcean web console.
#
# After ~5 minutes, SSH in and run:
#   cat /root/rustdesk-info.txt
# That file contains your RustDesk ID and password.
# ============================================================
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

log() { echo "[rustdesk-init] $*" | tee -a /var/log/rustdesk-init.log; }

# ── 1. System update + deps ───────────────────────────────────────────────────
log "1/8  System update"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget ca-certificates ufw

# ── 2. Docker ────────────────────────────────────────────────────────────────
log "2/8  Docker"
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# ── 3. RustDesk OSS self-hosted relay (the server component) ─────────────────
log "3/8  RustDesk relay server"
mkdir -p /opt/rustdesk-server
wget -q https://rustdesk.com/oss.yml -O /opt/rustdesk-server/compose.yml
cd /opt/rustdesk-server
docker compose up -d

# Wait up to 60 s for the relay to generate its Ed25519 key pair
for i in $(seq 1 30); do
    [ -f /opt/rustdesk-server/data/id_ed25519.pub ] && break
    sleep 2
done
RELAY_KEY=$(cat /opt/rustdesk-server/data/id_ed25519.pub 2>/dev/null || echo "PENDING")
DROPLET_IP=$(curl -sf http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address)

# ── 4. XFCE4 desktop + virtual display (Xvfb) ────────────────────────────────
log "4/8  XFCE4 desktop"
apt-get install -y -qq xfce4 xfce4-terminal xvfb dbus-x11

# ── 5. RustDesk client (connects the desktop to the relay) ───────────────────
log "5/8  RustDesk client"
RD_VER=$(curl -fsSL https://api.github.com/repos/rustdesk/rustdesk/releases/latest \
    | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
wget -q "https://github.com/rustdesk/rustdesk/releases/download/${RD_VER}/rustdesk-${RD_VER}-x86_64.deb" \
    -O /tmp/rustdesk.deb
apt-get install -y -qq /tmp/rustdesk.deb 2>/dev/null || \
    (apt-get install -f -y -qq && dpkg -i /tmp/rustdesk.deb)

# Point the local client at the self-hosted relay
mkdir -p /root/.config/rustdesk
cat > /root/.config/rustdesk/RustDesk2.toml <<EOF
rendezvous_server = '${DROPLET_IP}'
[options]
custom-rendezvous-server = '${DROPLET_IP}'
key = '${RELAY_KEY}'
EOF

# Set a permanent password for incoming connections
RD_PASSWORD="Blackglass2026!"
rustdesk --password "${RD_PASSWORD}" 2>/dev/null || true

# ── 6. Systemd services: virtual display → desktop → rustdesk daemon ─────────
log "6/8  Systemd services"

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
Description=XFCE4 on :1
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

cat > /etc/systemd/system/rustdesk.service <<'UNIT'
[Unit]
Description=RustDesk remote desktop daemon
After=xfce-desktop.service docker.service
[Service]
Environment=DISPLAY=:1
Environment=HOME=/root
ExecStartPre=/bin/sleep 8
ExecStart=/usr/bin/rustdesk --service
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable xvfb xfce-desktop rustdesk
systemctl start xvfb
# xfce-desktop and rustdesk start after reboot / on next boot sequence

# ── 7. UFW firewall ───────────────────────────────────────────────────────────
log "7/8  UFW"
ufw allow 22/tcp    comment 'SSH'
ufw allow 21114/tcp comment 'RustDesk 1.4+ client probe (avoid rendezvous blackhole)'
ufw allow 21115/tcp comment 'RustDesk NAT test'
ufw allow 21116/tcp comment 'RustDesk ID server'
ufw allow 21116/udp comment 'RustDesk hole-punch'
ufw allow 21117/tcp comment 'RustDesk relay'
ufw allow 21118/tcp comment 'RustDesk web WS'
ufw allow 21119/tcp comment 'RustDesk web WSS'
ufw --force enable

# ── 8. Write connection info ──────────────────────────────────────────────────
log "8/8  Writing /root/rustdesk-info.txt"

# Start services now so we can grab the RustDesk ID
systemctl start xfce-desktop 2>/dev/null || true
sleep 12
systemctl start rustdesk 2>/dev/null || true
sleep 5

RD_ID=$(DISPLAY=:1 rustdesk --get-id 2>/dev/null || echo "run: rustdesk --get-id")

cat > /root/rustdesk-info.txt <<EOF
========================================
  RustDesk Connection Details
========================================
Server IP       : ${DROPLET_IP}
Server Key      : ${RELAY_KEY}
RustDesk ID     : ${RD_ID}
Password        : ${RD_PASSWORD}

HOW TO CONNECT FROM YOUR PC
----------------------------------------
1. Install RustDesk on your PC:
   https://rustdesk.com/

2. Settings → Network → ID/Relay Server:
     ${DROPLET_IP}

3. Settings → Network → Key:
     ${RELAY_KEY}

4. Back on the main screen, enter ID:
     ${RD_ID}
   and connect using password above.

========================================
EOF

chmod 600 /root/rustdesk-info.txt
log "DONE — cat /root/rustdesk-info.txt"
