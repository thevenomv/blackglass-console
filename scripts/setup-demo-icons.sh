#!/usr/bin/env bash
# =============================================================
#  BLACKGLASS — Setup XFCE desktop icons on the demo VM
#  Creates two one-click launchers on the root user's XFCE desktop:
#    • "Run BLACKGLASS Demo"  — runs full-demo.sh in a terminal
#    • "Reset Demo"           — runs reset.sh to restore clean state
#
#  Run ON the demo VM as root (called automatically by deploy-demo-scripts.ps1):
#    bash /root/demo/setup-demo-icons.sh
# =============================================================
set -euo pipefail

DESKTOP_DIR="/root/Desktop"
DEMO_DIR="/root/demo"

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"; exit 1
fi

mkdir -p "${DESKTOP_DIR}"

echo "[icons] Writing desktop launchers to ${DESKTOP_DIR} ..."

# ── Pre-demo Health Check ─────────────────────────────────────
cat > "${DESKTOP_DIR}/blackglass-check-demo.desktop" <<'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Check Demo VM
GenericName=Health Check
Comment=Verify all services are running and print the RustDesk peer ID
Exec=xfce4-terminal --title "BLACKGLASS Health Check" --hold -x bash /root/demo/check.sh
Icon=dialog-information
Terminal=false
StartupNotify=false
Categories=System;Security;
EOF

# ── Run BLACKGLASS Demo ───────────────────────────────────────
cat > "${DESKTOP_DIR}/blackglass-run-demo.desktop" <<'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Run BLACKGLASS Demo
GenericName=Attack Simulation
Comment=Launch the 8-scene BLACKGLASS drift/attack demonstration
Exec=xfce4-terminal --title "BLACKGLASS Demo" --hold -x bash /root/demo/full-demo.sh
Icon=system-run
Terminal=false
StartupNotify=false
Categories=System;Security;
EOF

# ── Reset Demo ────────────────────────────────────────────────
cat > "${DESKTOP_DIR}/blackglass-reset-demo.desktop" <<'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Reset Demo
GenericName=Demo Reset
Comment=Revert all 8 attack scenarios and restore clean baseline state
Exec=xfce4-terminal --title "BLACKGLASS Reset" --hold -x bash /root/demo/reset.sh
Icon=view-refresh
Terminal=false
StartupNotify=false
Categories=System;Security;
EOF

# Mark executable — XFCE requires this to treat .desktop as a launcher
chmod +x "${DESKTOP_DIR}/blackglass-check-demo.desktop"
chmod +x "${DESKTOP_DIR}/blackglass-run-demo.desktop"
chmod +x "${DESKTOP_DIR}/blackglass-reset-demo.desktop"

# Mark trusted — suppresses the "Untrusted Launcher" dialog in XFCE 4.14+
if command -v gio &>/dev/null; then
  gio set "${DESKTOP_DIR}/blackglass-check-demo.desktop"  metadata::trusted true 2>/dev/null || true
  gio set "${DESKTOP_DIR}/blackglass-run-demo.desktop"    metadata::trusted true 2>/dev/null || true
  gio set "${DESKTOP_DIR}/blackglass-reset-demo.desktop"  metadata::trusted true 2>/dev/null || true
  echo "[icons] Marked as trusted (gio)"
fi

# Reload XFCE desktop so icons appear immediately
if pgrep -x xfdesktop &>/dev/null; then
  DISPLAY=:1 xfdesktop --reload 2>/dev/null || true
  echo "[icons] xfdesktop reloaded"
fi

echo ""
echo "=========================================="
echo "  Desktop icons created:"
ls -la "${DESKTOP_DIR}"/*.desktop
echo ""
echo "  In RustDesk you will see three icons:"
echo "  -> 'Check Demo VM'       — run first to confirm everything is working"
echo "  -> 'Run BLACKGLASS Demo' — double-click to start the demo"
echo "  -> 'Reset Demo'          — double-click after demo to restore clean state"
echo "=========================================="
