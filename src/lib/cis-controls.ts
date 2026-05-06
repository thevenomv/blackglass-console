/**
 * CIS Benchmark control mappings for BLACKGLASS drift categories.
 *
 * Maps DriftCategory values to the relevant CIS Controls (Center for Internet Security
 * Benchmarks for Linux servers, v8).  Used in the DriftInvestigationDrawer to surface
 * compliance context alongside each finding.
 *
 * Source: CIS Benchmarks for Ubuntu / Red Hat Linux Level 1 & 2
 * controlId format: "<section>.<subsection>.<item>" matching CIS benchmark numbering.
 */

export interface CisControl {
  controlId: string;
  title: string;
  /** CIS Level — 1 = broad applicability, 2 = defence in depth. */
  level: 1 | 2;
  benchmark: string;
}

/** Map from DriftCategory (or string) → applicable CIS controls. */
export const CIS_CONTROLS: Record<string, CisControl[]> = {
  ssh: [
    { controlId: "5.2.1",  title: "Ensure permissions on /etc/ssh/sshd_config are configured", level: 1, benchmark: "CIS L1" },
    { controlId: "5.2.4",  title: "Ensure SSH Protocol is set to 2", level: 1, benchmark: "CIS L1" },
    { controlId: "5.2.7",  title: "Ensure SSH MaxAuthTries is set to 4 or less", level: 1, benchmark: "CIS L1" },
    { controlId: "5.2.8",  title: "Ensure SSH IgnoreRhosts is enabled", level: 1, benchmark: "CIS L1" },
    { controlId: "5.2.10", title: "Ensure SSH PermitRootLogin is disabled", level: 1, benchmark: "CIS L1" },
    { controlId: "5.2.11", title: "Ensure SSH PermitEmptyPasswords is disabled", level: 1, benchmark: "CIS L1" },
    { controlId: "5.2.12", title: "Ensure SSH PermitUserEnvironment is disabled", level: 1, benchmark: "CIS L1" },
    { controlId: "5.2.13", title: "Ensure only approved Ciphers are used", level: 1, benchmark: "CIS L1" },
    { controlId: "5.2.20", title: "Ensure SSH AllowTcpForwarding is disabled", level: 2, benchmark: "CIS L2" },
    { controlId: "5.2.22", title: "Ensure SSH MaxSessions is limited", level: 1, benchmark: "CIS L1" },
  ],
  network_exposure: [
    { controlId: "3.4.1",   title: "Ensure a firewall package is installed", level: 1, benchmark: "CIS L1" },
    { controlId: "3.4.2",   title: "Ensure loopback traffic is configured", level: 1, benchmark: "CIS L1" },
    { controlId: "3.5.1.1", title: "Ensure ufw is installed", level: 1, benchmark: "CIS L1" },
    { controlId: "3.5.1.4", title: "Ensure ufw default deny firewall policy", level: 1, benchmark: "CIS L1" },
    { controlId: "3.5.1.7", title: "Ensure ufw firewall rules exist for all open ports", level: 1, benchmark: "CIS L1" },
    { controlId: "3.5.2.1", title: "Ensure nftables is installed", level: 1, benchmark: "CIS L1" },
  ],
  firewall: [
    { controlId: "3.4.1",   title: "Ensure a firewall package is installed", level: 1, benchmark: "CIS L1" },
    { controlId: "3.5.1.3", title: "Ensure ufw service is enabled", level: 1, benchmark: "CIS L1" },
    { controlId: "3.5.1.4", title: "Ensure ufw default deny firewall policy", level: 1, benchmark: "CIS L1" },
    { controlId: "3.5.3.3", title: "Ensure iptables default deny firewall policy", level: 1, benchmark: "CIS L1" },
    { controlId: "3.5.3.4", title: "Ensure iptables loopback traffic is configured", level: 1, benchmark: "CIS L1" },
  ],
  packages: [
    { controlId: "1.9", title: "Ensure updates, patches, and additional security software are installed", level: 1, benchmark: "CIS L1" },
    { controlId: "2.1", title: "Ensure inetd is not installed", level: 1, benchmark: "CIS L1" },
  ],
  integrity: [
    { controlId: "1.3.1", title: "Ensure AIDE is installed", level: 1, benchmark: "CIS L1" },
    { controlId: "1.3.2", title: "Ensure filesystem integrity is regularly checked", level: 1, benchmark: "CIS L1" },
    { controlId: "1.4.1", title: "Ensure permissions on bootloader config are not overridden", level: 1, benchmark: "CIS L1" },
    { controlId: "1.4.2", title: "Ensure bootloader password is set", level: 1, benchmark: "CIS L1" },
  ],
  identity: [
    { controlId: "5.4.1.1", title: "Ensure password expiration is 365 days or less", level: 1, benchmark: "CIS L1" },
    { controlId: "5.4.1.2", title: "Ensure minimum days between password changes is configured", level: 1, benchmark: "CIS L1" },
    { controlId: "5.4.1.4", title: "Ensure inactive password lock is 30 days or less", level: 1, benchmark: "CIS L1" },
    { controlId: "5.3.1",   title: "Ensure password creation requirements are configured", level: 1, benchmark: "CIS L1" },
    { controlId: "6.2.8",   title: "Ensure users' home directories have 750 or more restrictive permissions", level: 1, benchmark: "CIS L1" },
    { controlId: "6.2.9",   title: "Ensure users own their home directories", level: 1, benchmark: "CIS L1" },
  ],
  privilege_escalation: [
    { controlId: "5.3.4", title: "Ensure su is restricted to the sudo group", level: 2, benchmark: "CIS L2" },
    { controlId: "5.3.5", title: "Ensure re-authentication for privilege escalation is not disabled globally", level: 1, benchmark: "CIS L1" },
    { controlId: "5.3.6", title: "Ensure sudo authentication timeout is configured correctly", level: 1, benchmark: "CIS L1" },
  ],
  persistence: [
    { controlId: "5.1.1", title: "Ensure cron daemon is enabled and running", level: 1, benchmark: "CIS L1" },
    { controlId: "5.1.2", title: "Ensure permissions on /etc/crontab are configured", level: 1, benchmark: "CIS L1" },
    { controlId: "5.1.8", title: "Ensure at/cron is restricted to authorized users", level: 1, benchmark: "CIS L1" },
    { controlId: "5.1.9", title: "Ensure at is restricted to authorized users", level: 1, benchmark: "CIS L1" },
  ],
};

/**
 * Returns CIS controls applicable to a given drift category.
 * Returns an empty array for unknown categories.
 */
export function getCisControls(category: string): CisControl[] {
  return CIS_CONTROLS[category] ?? [];
}
