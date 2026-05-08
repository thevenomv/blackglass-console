#!/usr/bin/env bash
# scripts/lab/seed-drift.sh
#
# Seeds a small, deterministic set of drift-triggering changes on the
# canonical sales-demo VM (blackglass-rustdesk-demo, 167.99.59.55). Run
# AFTER the operator has captured a clean baseline from the BLACKGLASS
# console — every change here will then surface as drift on the next
# agent push (or scan).
#
# What gets changed (categorised so the demo lines up with the four
# remediator risk tiers):
#
#   ssh        — sshd_config: ClientAliveInterval bumped (low / sandboxable)
#   pkg        — install `htop` via apt (medium / sandboxable)
#   permission — chmod 0644 on /etc/blackglass-demo/notes (low / guidance)
#   user       — append a comment line to /etc/sudoers.d/blackglass-scan (medium / approval)
#
# All changes are reversible by `scripts/lab/reset-drift.sh`. Nothing
# escalates privileges; nothing is destructive.
#
# Usage on the demo VM (as root):
#   curl -fsSL https://raw.githubusercontent.com/thevenomv/blackglass-console/main/scripts/lab/seed-drift.sh | bash
#
# Or, scp'd then run locally:
#   scp scripts/lab/seed-drift.sh root@167.99.59.55:/root/
#   ssh root@167.99.59.55 bash /root/seed-drift.sh

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "seed-drift: must run as root (use 'sudo bash $0')" >&2
  exit 1
fi

STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "==> [$STAMP] seeding demo drift on $(hostname)"

# ── 1. SSH (low severity, sandbox-verifiable) ────────────────────────────────
SSHD=/etc/ssh/sshd_config
if grep -q '^ClientAliveInterval' "$SSHD"; then
  sed -ri 's/^ClientAliveInterval.*/ClientAliveInterval 300/' "$SSHD"
else
  printf '\n# blackglass-demo seed (%s)\nClientAliveInterval 300\n' "$STAMP" >> "$SSHD"
fi
echo "  ssh: ClientAliveInterval set to 300"

# ── 2. Package install (medium severity, sandbox-verifiable) ────────────────
DEBIAN_FRONTEND=noninteractive apt-get -qq update >/dev/null
DEBIAN_FRONTEND=noninteractive apt-get -qq install -y htop >/dev/null
echo "  pkg: htop installed (was: not present)"

# ── 3. Permission drift (low severity, guidance only) ───────────────────────
mkdir -p /etc/blackglass-demo
if [[ ! -f /etc/blackglass-demo/notes ]]; then
  printf 'blackglass-demo: replayable drift seed file\n' > /etc/blackglass-demo/notes
fi
chmod 0644 /etc/blackglass-demo/notes
echo "  permission: /etc/blackglass-demo/notes set to 0644"

# ── 4. Sudoers comment (medium severity, approval-required) ─────────────────
SUDOERS=/etc/sudoers.d/blackglass-scan
if [[ -f "$SUDOERS" ]] && ! grep -q 'BG-DEMO-SEED' "$SUDOERS"; then
  printf '# BG-DEMO-SEED: harmless comment line added by seed-drift.sh (%s)\n' "$STAMP" >> "$SUDOERS"
  echo "  user: appended comment to $SUDOERS"
else
  echo "  user: $SUDOERS already seeded or missing — skipping"
fi

echo "==> done. Trigger a scan from the BLACKGLASS console to see the four findings."
