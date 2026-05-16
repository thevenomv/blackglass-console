/**
 * Client-safe re-export of remediation snippets.
 * The logic is pure (no server-only imports) — this thin wrapper
 * lets client components import it without bundling server-only code.
 */

import type { DriftEvent } from "@/data/mock/types";

export type RemediationSnippet = {
  label: string;
  language: "bash" | "ansible" | "text";
  code: string;
};

type SnippetEntry = {
  match: string;
  snippet: RemediationSnippet;
};

const SNIPPETS: SnippetEntry[] = [
  { match: "sudo group membership", snippet: { label: "Remove user from sudo/wheel group", language: "bash", code: `# Identify the unexpected user from the drift event detail, then:\nsudo deluser <USERNAME> sudo        # Debian/Ubuntu\n# OR\nsudo gpasswd -d <USERNAME> wheel    # RHEL/CentOS/Fedora\n\n# Verify:\ngetent group sudo wheel` } },
  { match: "sudoers", snippet: { label: "Review and restore /etc/sudoers", language: "bash", code: `# Review current sudoers file:\nsudo visudo --check\n\n# Remove an unexpected NOPASSWD entry by editing safely:\nsudo visudo   # never edit /etc/sudoers directly` } },
  { match: "suid", snippet: { label: "Remove unexpected SUID/SGID bit", language: "bash", code: `# Remove the SUID bit (replace path from drift detail):\nsudo chmod u-s /path/to/binary\n\n# Verify:\nls -la /path/to/binary` } },
  { match: "new local user", snippet: { label: "Remove unexpected local user account", language: "bash", code: `# Lock immediately while investigating:\nsudo passwd -l <USERNAME>\n\n# If confirmed unwanted:\nsudo deluser --remove-home <USERNAME>    # Debian/Ubuntu\n# OR\nsudo userdel -r <USERNAME>               # RHEL/CentOS/Fedora` } },
  { match: "user removed", snippet: { label: "Investigate removed user account", language: "bash", code: `# Check auth logs for recent activity:\nsudo grep <USERNAME> /var/log/auth.log | tail -40\nsudo last <USERNAME>` } },
  { match: "authorized key", snippet: { label: "Audit and clean authorized_keys", language: "bash", code: `# Remove a specific key:\nsudo -u <USERNAME> sed -i '/KEY_COMMENT/d' ~<USERNAME>/.ssh/authorized_keys\n\n# Verify key count:\nwc -l ~<USERNAME>/.ssh/authorized_keys` } },
  { match: "ssh", snippet: { label: "Harden sshd_config", language: "bash", code: `# Edit and harden SSH daemon:\nsudo nano /etc/ssh/sshd_config\n# PermitRootLogin no\n# PasswordAuthentication no\n# X11Forwarding no\n# MaxAuthTries 3\n\n# Test before reloading:\nsudo sshd -t\nsudo systemctl reload ssh` } },
  { match: "listening port", snippet: { label: "Stop unexpected listening service", language: "bash", code: `# Identify the process (replace PORT):\nsudo lsof -i :PORT\n\n# Stop and disable:\nsudo systemctl stop <SERVICE_NAME>\nsudo systemctl disable <SERVICE_NAME>\nsudo ufw deny PORT/tcp` } },
  { match: "firewall", snippet: { label: "Restore UFW firewall policy", language: "bash", code: `# Check status:\nsudo ufw status verbose\n\n# Enable with safe defaults:\nsudo ufw allow 22/tcp\nsudo ufw default deny incoming\nsudo ufw enable` } },
  { match: "cron", snippet: { label: "Audit and remove unexpected cron jobs", language: "bash", code: `# List system cron jobs:\nls -la /etc/cron.d/\n\n# Remove an unexpected file:\nsudo rm /etc/cron.d/<FILENAME>` } },
  { match: "file hash", snippet: { label: "Investigate modified critical file", language: "bash", code: `# Re-hash to confirm:\nmd5sum /etc/passwd /etc/shadow /etc/sudoers /etc/ssh/sshd_config /etc/hosts\n\n# Check recent modifications:\nstat /etc/sudoers\n\n# Restore from your config management system (Ansible/Puppet/Salt).` } },
  { match: "hosts entr", snippet: { label: "Review /etc/hosts for DNS hijacking", language: "bash", code: `# Show current /etc/hosts:\ncat /etc/hosts\n\n# Remove unexpected entry:\nsudo nano /etc/hosts` } },
  { match: "kernel module", snippet: { label: "Investigate unexpected kernel module", language: "bash", code: `# Unload:\nsudo modprobe -r <MODULE_NAME>\n\n# Blacklist on next boot:\necho "blacklist <MODULE_NAME>" | sudo tee /etc/modprobe.d/blacklist-<MODULE_NAME>.conf\nsudo update-initramfs -u` } },
  { match: "package", snippet: { label: "Remove unexpected package", language: "bash", code: `# Remove:\nsudo apt remove --purge <PACKAGE_NAME>   # Debian/Ubuntu\n# OR\nsudo dnf remove <PACKAGE_NAME>           # RHEL/CentOS/Fedora` } },
];

const GENERIC: RemediationSnippet = {
  label: "General investigation steps",
  language: "bash",
  code: `# Review recent logs:\nsudo journalctl -n 100 --no-pager\nsudo tail -100 /var/log/auth.log\n\n# Recently modified files:\nsudo find / -newer /etc/passwd -not -path "/proc/*" 2>/dev/null | head -40`,
};

export function getRemediationSnippet(event: Pick<DriftEvent, "title">): RemediationSnippet {
  const needle = event.title.toLowerCase();
  for (const entry of SNIPPETS) {
    if (needle.includes(entry.match.toLowerCase())) return entry.snippet;
  }
  return GENERIC;
}
