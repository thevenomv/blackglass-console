#!/usr/bin/env bash
# Install RustDesk client on Debian/Ubuntu x86_64 and point it at your self-hosted hbbs.
# Run ON the Linux demo droplet as root:
#   curl -fsSL https://raw.githubusercontent.com/.../rustdesk-linux-demo-setup.sh | bash
# or from your Windows machine (copy script up first):
#   scp scripts/rustdesk-linux-demo-setup.sh root@167.99.59.55:/tmp/
#   ssh root@167.99.59.55 'bash /tmp/rustdesk-linux-demo-setup.sh'
#
# Override defaults if needed:
#   RD_ID_SERVER=... RD_PUBLIC_KEY='...' bash rustdesk-linux-demo-setup.sh
# Full guide: docs/rustdesk-demo-setup.md

set -euo pipefail

RD_ID_SERVER="${RD_ID_SERVER:-206.189.114.207}"
RD_PUBLIC_KEY="${RD_PUBLIC_KEY:-8FFJuTNp6R4mA3QgCGh2JB4wEoZ9uSnaBWcj85vipQ4=}"
RD_PERM_PASSWORD="${RD_PERM_PASSWORD:-}"

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "Cannot detect OS (missing /etc/os-release)."
  exit 1
fi
# shellcheck source=/dev/null
. /etc/os-release

is_debian_like() {
  [[ "${ID:-}" == "debian" ]] || [[ "${ID:-}" == "ubuntu" ]] || \
    [[ "${ID_LIKE:-}" == *debian* ]] || [[ "${ID_LIKE:-}" == *ubuntu* ]]
}

download_deb() {
  local url
  url="$(curl -fsSL https://api.github.com/repos/rustdesk/rustdesk/releases/latest \
    | grep browser_download_url \
    | grep -E 'x86_64\.deb"' \
    | head -1 \
    | sed -n 's/.*"browser_download_url": "\([^"]*\)".*/\1/p')"
  if [[ -z "${url}" ]]; then
    echo "Could not find x86_64 .deb in latest RustDesk release."
    exit 1
  fi
  echo "Downloading: ${url}"
  curl -fL -o /tmp/rustdesk-latest.deb "${url}"
}

install_debian() {
  apt-get update -qq
  download_deb
  apt-get install -fy /tmp/rustdesk-latest.deb
}

if is_debian_like; then
  install_debian
else
  echo "This script only auto-installs .deb (Debian/Ubuntu). For RHEL-like, install rustdesk RPM manually then re-run only the --config section of this script."
  exit 1
fi

systemctl stop rustdesk 2>/dev/null || true

CFG="host=${RD_ID_SERVER},key=${RD_PUBLIC_KEY}"
# Applies network settings non-interactively (same pattern as Windows admin CLI).
rustdesk --config "${CFG}" || true

if [[ -n "${RD_PERM_PASSWORD}" ]]; then
  rustdesk --password "${RD_PERM_PASSWORD}" || true
fi

systemctl enable rustdesk 2>/dev/null || true
systemctl restart rustdesk
sleep 2

echo ""
echo "=========================================="
RID="$(rustdesk --get-id 2>/dev/null || echo '(run rustdesk --get-id again if empty)')"
echo "RustDesk ID (share with your Windows client): ${RID}"
if [[ -n "${RD_PERM_PASSWORD}" ]]; then
  echo "Permanent password: (the one you set in RD_PERM_PASSWORD)"
else
  echo "Password: use the one-time password in the RustDesk UI, or set RD_PERM_PASSWORD and re-run."
fi
echo "ID server: ${RD_ID_SERVER}"
echo "=========================================="
