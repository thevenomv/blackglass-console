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
# Optional: export KEY='ssh-ed25519 AAAA... comment' before running to install your public key.
KEY="${KEY:-}"

if hostname -I 2>/dev/null | grep -q '167\.99\.59\.55'; then
  echo "ERROR: This host looks like the DEMO VM (167.99.59.55). Run this on the RustDesk ID server, not the demo desktop." >&2
  exit 1
fi

if [[ -n "${KEY}" ]]; then
  mkdir -p /root/.ssh
  chmod 700 /root/.ssh
  touch /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  grep -qF "${KEY}" /root/.ssh/authorized_keys || echo "${KEY}" >> /root/.ssh/authorized_keys
  echo "[ok] SSH public key added for root"
else
  echo "[skip] No KEY env set — SSH authorized_keys unchanged (set KEY='ssh-ed25519 ...' to add yours)"
fi

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  if ! ufw status 2>/dev/null | grep -qE '21114/tcp.*ALLOW'; then
    ufw allow 21114/tcp comment 'RustDesk 1.4+ client probe'
    echo "[ok] UFW: allowed TCP 21114 (avoid rendezvous timeouts when dropped)"
  else
    echo "[ok] UFW: 21114 already allowed"
  fi
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
