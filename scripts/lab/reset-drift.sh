#!/usr/bin/env bash
# scripts/lab/reset-drift.sh
#
# Reverts the demo drift seeded by `seed-drift.sh` so the next scan
# returns the VM to clean baseline. Useful between back-to-back demos
# without rebuilding the Droplet.
#
# Idempotent — safe to run multiple times.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "reset-drift: must run as root (use 'sudo bash $0')" >&2
  exit 1
fi

echo "==> reverting demo drift on $(hostname)"

# 1. SSH — strip the seeded ClientAliveInterval line (or reset to default)
SSHD=/etc/ssh/sshd_config
if grep -q '^ClientAliveInterval 300' "$SSHD"; then
  sed -ri '/^# blackglass-demo seed/d' "$SSHD"
  sed -ri '/^ClientAliveInterval 300$/d' "$SSHD"
  echo "  ssh: removed ClientAliveInterval seed"
fi

# 2. Package — uninstall htop (only if it was the seeded one)
if dpkg -s htop >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get -qq remove -y htop >/dev/null
  echo "  pkg: htop removed"
fi

# 3. Permission — drop the demo notes file entirely
if [[ -f /etc/blackglass-demo/notes ]]; then
  rm -f /etc/blackglass-demo/notes
  rmdir /etc/blackglass-demo 2>/dev/null || true
  echo "  permission: /etc/blackglass-demo cleaned"
fi

# 4. Sudoers — strip the BG-DEMO-SEED comment lines
SUDOERS=/etc/sudoers.d/blackglass-scan
if [[ -f "$SUDOERS" ]] && grep -q 'BG-DEMO-SEED' "$SUDOERS"; then
  sed -i '/BG-DEMO-SEED/d' "$SUDOERS"
  echo "  user: cleaned BG-DEMO-SEED comment from $SUDOERS"
fi

echo "==> done. Run a scan; should return to zero drift on the seeded categories."
