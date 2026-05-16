#!/bin/bash
# Run as root on the Droplet — sets up the blackglass collector user
set -e

PUB_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMhxTjO+uakkZ6Q0JtB6s1Bj5Ehe5/w2B79QQYGjMhu blackglass-collector"

# Create user
useradd -m -s /bin/bash blackglass 2>/dev/null || echo "user exists"

# Authorize the collector key
mkdir -p /home/blackglass/.ssh
echo "$PUB_KEY" > /home/blackglass/.ssh/authorized_keys
chmod 700 /home/blackglass/.ssh
chmod 600 /home/blackglass/.ssh/authorized_keys
chown -R blackglass:blackglass /home/blackglass/.ssh

# Passwordless sudo for exactly the commands the collector needs
cat > /etc/sudoers.d/blackglass-collector << 'EOF'
# BLACKGLASS collector — read-only system introspection
blackglass ALL=(ALL) NOPASSWD: /usr/sbin/sshd -T
blackglass ALL=(ALL) NOPASSWD: /usr/sbin/ufw status verbose
blackglass ALL=(ALL) NOPASSWD: /usr/sbin/ufw status
EOF
chmod 440 /etc/sudoers.d/blackglass-collector

echo "Setup complete"
id blackglass
