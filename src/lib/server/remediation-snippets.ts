/**
 * Remediation snippet generator.
 *
 * Maps drift event title patterns to actionable bash / Ansible snippets.
 * The snippet is shown in the DriftInvestigationDrawer to give operators the
 * exact command to resolve the finding without leaving BLACKGLASS.
 *
 * Design notes:
 * - Snippets are informational only — BLACKGLASS never executes them.
 * - Each snippet includes a comment explaining what it does and why.
 * - Where the exact value matters (e.g. the added user), the snippet uses
 *   placeholders like <USERNAME> that the operator substitutes.
 * - If no specific snippet is mapped, a generic investigation guide is returned.
 */

import type { DriftEvent } from "@/data/mock/types";

export type RemediationSnippet = {
  /** Human-readable title for the code block header. */
  label: string;
  /** "bash" | "ansible" | "text" */
  language: "bash" | "ansible" | "text";
  /** The snippet content. */
  code: string;
};

// ---------------------------------------------------------------------------
// Snippet library (ordered — first match wins)
// ---------------------------------------------------------------------------

type SnippetEntry = {
  /** Matched against event.title (case-insensitive substring). */
  match: string;
  snippet: RemediationSnippet;
};

const SNIPPETS: SnippetEntry[] = [
  // ---------------------------------------------------------------------------
  // Privilege escalation
  // ---------------------------------------------------------------------------
  {
    match: "sudo group membership",
    snippet: {
      label: "Remove user from sudo/wheel group",
      language: "bash",
      code: `# Identify the unexpected user from the drift event detail, then:
sudo deluser <USERNAME> sudo        # Debian/Ubuntu
# OR
sudo gpasswd -d <USERNAME> wheel    # RHEL/CentOS/Fedora

# Verify:
getent group sudo wheel`,
    },
  },
  {
    match: "sudoers",
    snippet: {
      label: "Review and restore /etc/sudoers",
      language: "bash",
      code: `# Review current sudoers file:
sudo visudo --check

# Diff against your known-good baseline:
sudo diff /etc/sudoers <(curl -sS https://<your-baseline-url>/sudoers)

# Remove an unexpected NOPASSWD entry by editing safely:
sudo visudo   # never edit /etc/sudoers directly`,
    },
  },
  {
    match: "suid",
    snippet: {
      label: "Remove unexpected SUID/SGID bit",
      language: "bash",
      code: `# Remove the SUID bit from the unexpected binary (replace path from drift detail):
sudo chmod u-s /path/to/binary

# Verify:
ls -la /path/to/binary
# Expected: -rwxr-xr-x (no 's' in owner permission)

# If the binary should not exist at all:
sudo rm /path/to/binary`,
    },
  },

  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  {
    match: "new local user",
    snippet: {
      label: "Remove unexpected local user account",
      language: "bash",
      code: `# Identify the username from the drift event detail, then:
# Lock the account immediately while investigating:
sudo passwd -l <USERNAME>

# If confirmed unwanted, delete user and home directory:
sudo deluser --remove-home <USERNAME>    # Debian/Ubuntu
# OR
sudo userdel -r <USERNAME>               # RHEL/CentOS/Fedora

# Verify:
id <USERNAME>   # should return: no such user`,
    },
  },
  {
    match: "user removed",
    snippet: {
      label: "Investigate removed user account",
      language: "bash",
      code: `# Check auth logs for recent activity from the removed account:
sudo grep <USERNAME> /var/log/auth.log | tail -40
sudo last <USERNAME>

# If the removal was accidental, restore from your user provisioning tool
# (Ansible, Puppet, Salt, or cloud-init) rather than re-creating manually.`,
    },
  },

  // ---------------------------------------------------------------------------
  // Authorized keys
  // ---------------------------------------------------------------------------
  {
    match: "authorized key",
    snippet: {
      label: "Audit and clean authorized_keys",
      language: "bash",
      code: `# List all authorized keys for all shell users:
awk -F: '$7~/bash|sh$/{print $1 ":" $6}' /etc/passwd | while IFS=: read u h; do
  f="$h/.ssh/authorized_keys"
  [ -f "$f" ] && echo "=== $u ===" && cat "$f"
done

# Remove a specific key (replace KEY_COMMENT with the key comment from drift detail):
# Edit the file and remove the matching line:
sudo -u <USERNAME> sed -i '/KEY_COMMENT/d' ~<USERNAME>/.ssh/authorized_keys

# Verify key count:
wc -l ~<USERNAME>/.ssh/authorized_keys`,
    },
  },

  // ---------------------------------------------------------------------------
  // SSH configuration
  // ---------------------------------------------------------------------------
  {
    match: "ssh",
    snippet: {
      label: "Harden sshd_config",
      language: "bash",
      code: `# Edit SSH daemon configuration:
sudo nano /etc/ssh/sshd_config

# Recommended secure values:
# PermitRootLogin no
# PasswordAuthentication no
# PermitEmptyPasswords no
# X11Forwarding no
# AllowTcpForwarding no
# MaxAuthTries 3

# Test config before reloading:
sudo sshd -t

# Apply:
sudo systemctl reload ssh   # Debian/Ubuntu
# OR
sudo systemctl reload sshd  # RHEL/CentOS/Fedora`,
    },
  },

  // ---------------------------------------------------------------------------
  // Network exposure / listening ports
  // ---------------------------------------------------------------------------
  {
    match: "listening port",
    snippet: {
      label: "Identify and stop unexpected listening service",
      language: "bash",
      code: `# Show all listening services and their processes:
ss -tlnp

# Identify the process on the unexpected port (replace PORT):
sudo lsof -i :PORT
sudo fuser PORT/tcp

# Stop and disable the service (replace SERVICE_NAME):
sudo systemctl stop <SERVICE_NAME>
sudo systemctl disable <SERVICE_NAME>

# Block the port at the firewall as a defence-in-depth measure:
sudo ufw deny PORT/tcp`,
    },
  },

  // ---------------------------------------------------------------------------
  // Firewall
  // ---------------------------------------------------------------------------
  {
    match: "firewall",
    snippet: {
      label: "Restore UFW firewall policy",
      language: "bash",
      code: `# Check current firewall status:
sudo ufw status verbose

# If UFW is inactive, enable it (WARNING: ensure SSH port is allowed first):
sudo ufw allow 22/tcp
sudo ufw enable

# Set default deny-inbound policy:
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Reload:
sudo ufw reload`,
    },
  },

  // ---------------------------------------------------------------------------
  // Persistence (cron)
  // ---------------------------------------------------------------------------
  {
    match: "cron",
    snippet: {
      label: "Audit and remove unexpected cron jobs",
      language: "bash",
      code: `# List all system cron jobs:
ls -la /etc/cron.d/
cat /etc/cron.d/*

# List user crontabs:
for u in $(cut -d: -f1 /etc/passwd); do
  sudo crontab -l -u $u 2>/dev/null && echo "(user: $u)"
done

# Remove an unexpected system cron file:
sudo rm /etc/cron.d/<FILENAME>

# Remove an unexpected user crontab entry:
sudo crontab -e -u <USERNAME>   # remove the offending line`,
    },
  },

  // ---------------------------------------------------------------------------
  // File integrity
  // ---------------------------------------------------------------------------
  {
    match: "file hash",
    snippet: {
      label: "Investigate modified critical file",
      language: "bash",
      code: `# Re-hash the file to confirm the change is still present:
md5sum /etc/passwd /etc/shadow /etc/sudoers /etc/ssh/sshd_config /etc/hosts

# Check recent modifications:
ls -lZ /etc/passwd /etc/shadow /etc/sudoers /etc/ssh/sshd_config /etc/hosts
stat /etc/sudoers

# Review change content:
sudo git diff --no-index /etc/sudoers.baseline /etc/sudoers  # if you keep backups

# If the file was tampered, restore from your configuration management system
# (Ansible, Puppet, Salt) rather than editing manually.`,
    },
  },

  // ---------------------------------------------------------------------------
  // /etc/hosts
  // ---------------------------------------------------------------------------
  {
    match: "hosts entr",
    snippet: {
      label: "Review /etc/hosts for DNS hijacking",
      language: "bash",
      code: `# Show current /etc/hosts:
cat /etc/hosts

# Compare against expected content (replace URL with your baseline):
diff /etc/hosts <(curl -sS https://<your-config-server>/hosts.baseline)

# Remove the unexpected entry (edit carefully — one line at a time):
sudo nano /etc/hosts

# Verify DNS resolution is not affected:
host <DOMAIN_NAME>`,
    },
  },

  // ---------------------------------------------------------------------------
  // Kernel modules
  // ---------------------------------------------------------------------------
  {
    match: "kernel module",
    snippet: {
      label: "Investigate unexpected kernel module",
      language: "bash",
      code: `# List loaded modules with details:
lsmod | grep <MODULE_NAME>
modinfo <MODULE_NAME>

# Unload the module (if safe):
sudo modprobe -r <MODULE_NAME>

# Prevent it loading on next boot:
echo "blacklist <MODULE_NAME>" | sudo tee /etc/modprobe.d/blacklist-<MODULE_NAME>.conf
sudo update-initramfs -u   # Debian/Ubuntu
# OR
sudo dracut --force        # RHEL/CentOS/Fedora

# Verify:
lsmod | grep <MODULE_NAME>   # should return nothing`,
    },
  },

  // ---------------------------------------------------------------------------
  // Packages
  // ---------------------------------------------------------------------------
  {
    match: "package",
    snippet: {
      label: "Remove unexpected package",
      language: "bash",
      code: `# Verify the package is present and check install date:
dpkg -l <PACKAGE_NAME>           # Debian/Ubuntu
# OR
rpm -qi <PACKAGE_NAME>           # RHEL/CentOS/Fedora

# Check when it was installed:
grep " install <PACKAGE_NAME>" /var/log/dpkg.log   # Debian/Ubuntu

# Remove the package:
sudo apt remove --purge <PACKAGE_NAME>   # Debian/Ubuntu
# OR
sudo dnf remove <PACKAGE_NAME>           # RHEL/CentOS/Fedora`,
    },
  },
];

// ---------------------------------------------------------------------------
// Generic fallback
// ---------------------------------------------------------------------------

const GENERIC_SNIPPET: RemediationSnippet = {
  label: "General investigation steps",
  language: "bash",
  code: `# 1. Review recent auth and system logs:
sudo journalctl -n 100 --no-pager
sudo tail -100 /var/log/auth.log

# 2. Check for recently modified files:
sudo find / -newer /etc/passwd -not -path "/proc/*" -not -path "/sys/*" 2>/dev/null | head -40

# 3. Review running processes for anomalies:
ps auxf

# 4. Check active network connections:
ss -tlnp`,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the best-matching remediation snippet for a drift event,
 * or a generic investigation guide when no specific match is found.
 */
export function getRemediationSnippet(event: DriftEvent): RemediationSnippet {
  const needle = event.title.toLowerCase();
  for (const entry of SNIPPETS) {
    if (needle.includes(entry.match.toLowerCase())) {
      return entry.snippet;
    }
  }
  return GENERIC_SNIPPET;
}
