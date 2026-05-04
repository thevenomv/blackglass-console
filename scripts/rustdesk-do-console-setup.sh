#!/usr/bin/env bash
# Run ONLY on the RustDesk ID server droplet (public IP 206.189.114.207).
# NOT on blackglass-rustdesk-demo (167.99.59.55).
#
# Best: DO web console on 206 -> run:
#   curl -fsSL https://raw.githubusercontent.com/thevenomv/blackglass-console/main/scripts/rustdesk-do-console-setup.sh | bash
# (Push this file to GitHub first.)
#
# Avoid pasting this whole file from Windows into the console (encoding breaks).

set -euo pipefail

RELAY_IP="${RELAY_IP:-206.189.114.207}"
INSTALL_SSH_KEY="${INSTALL_SSH_KEY:-1}"
KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGSOFtWC+Tvl2LJnMnnVCtEDgkKRcIGZhqlxVod9Rbz4 sible@blackglass'

if hostname -I 2>/dev/null | grep -q '167\.99\.59\.55'; then
  echo "ERROR: This host is the DEMO VM (167.99.59.55). Open the Droplet Console for 206.189.114.207 (rustdesk-server), not this one." >&2
  exit 1
fi

if [[ "${INSTALL_SSH_KEY}" == "1" && -n "${KEY}" ]]; then
  mkdir -p /root/.ssh
  chmod 700 /root/.ssh
  touch /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  grep -qF "${KEY}" /root/.ssh/authorized_keys || echo "${KEY}" >> /root/.ssh/authorized_keys
  echo "[ok] SSH public key added for root"
fi

if ! systemctl list-unit-files 2>/dev/null | grep -q '^hbbs\.service'; then
  echo "[warn] No systemd hbbs.service. Use Docker: add -r ${RELAY_IP} to hbbs, then docker compose up -d" >&2
  exit 0
fi

OLD_CMD="$(systemctl cat hbbs.service 2>/dev/null | grep '^ExecStart=' | head -1 | cut -d= -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
if [[ "${OLD_CMD:0:1}" == '"' ]]; then
  OLD_CMD="${OLD_CMD:1:${#OLD_CMD}-2}"
fi

if [[ -z "${OLD_CMD}" ]]; then
  echo "[error] Cannot parse ExecStart from hbbs.service" >&2
  systemctl cat hbbs.service >&2
  exit 1
fi

if echo "${OLD_CMD}" | grep -qE '(^|[[:space:]])-r[[:space:]=]'; then
  echo "[ok] hbbs already has -r. ExecStart: ${OLD_CMD}"
else
  mkdir -p /etc/systemd/system/hbbs.service.d
  printf '%s\n' '[Service]' 'ExecStart=' "ExecStart=${OLD_CMD} -r ${RELAY_IP}" > /etc/systemd/system/hbbs.service.d/10-relay.conf
  systemctl daemon-reload
  systemctl restart hbbs.service
  echo "[ok] hbbs restarted with -r ${RELAY_IP}"
fi

systemctl is-active hbbs.service || true
echo "Relay in clients must be ${RELAY_IP}:21117 (port 21117, not 2116)."
