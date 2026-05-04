#!/usr/bin/env bash
set -e
FILE=/root/.config/rustdesk/RustDesk2.toml
if ! grep -q "^disable-udp" "$FILE" 2>/dev/null; then
  sed -i "/^\[options\]/a disable-udp = 'Y'" "$FILE"
fi
sed -i '/^local-ip-addr/d' "$FILE"
systemctl restart rustdesk
sleep 2
systemctl is-active rustdesk
