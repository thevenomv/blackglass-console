import type { ScanContext } from "@/lib/server/secrets";

export type CollectScanOptions = {
  scanId?: string;
  reason?: ScanContext["reason"];
  /** Only these `hostId` values (e.g. `host-127-0-0-1`) are collected. */
  hostIds?: string[];
};

export type ListeningPort = {
  proto: "tcp" | "udp";
  bind: string;
  port: number;
  process?: string;
};

export type LocalUser = {
  username: string;
  uid: number;
};

export type RunningService = {
  unit: string;
  sub: string;
};

export type SSHConfig = {
  permitRootLogin: string;
  passwordAuthentication: string;
  permitEmptyPasswords?: string;
  x11Forwarding?: string;
  allowTcpForwarding?: string;
  allowAgentForwarding?: string;
  maxAuthTries?: string;
  port?: string;
};

export type FirewallStatus = {
  active: boolean;
  defaultInbound: string;
  rules: string[];
};

export type CronEntry = {
  filename: string;
};

export type AuthorizedKey = {
  user: string;
  keyType: string;
  /** Last 16 chars of key material — stable enough to detect additions/removals. */
  keyFingerprint: string;
  comment: string;
};

export type FileHash = {
  path: string;
  hash: string;
};

export type HostsEntry = {
  ip: string;
  hostnames: string[];
};

export type HostSnapshot = {
  hostId: string;
  hostname: string;
  collectedAt: string;
  listeners: ListeningPort[];
  users: LocalUser[];
  sudoers: string[];
  /** Filenames present in /etc/sudoers.d/ — new files indicate privilege backdoors. */
  sudoersFiles: string[];
  cronEntries: CronEntry[];
  /** Usernames with a crontab in /var/spool/cron/crontabs/. */
  userCrontabs: string[];
  services: RunningService[];
  ssh: SSHConfig;
  firewall: FirewallStatus;
  /** SSH authorized_keys entries for all login users. */
  authorizedKeys: AuthorizedKey[];
  /** MD5 hashes of critical config files to detect tampering. */
  fileHashes: FileHash[];
  /** Non-comment entries in /etc/hosts — detect DNS hijacking. */
  hostsEntries: HostsEntry[];
  /** Binaries with SUID/SGID bit set — detect planted privilege-escalation tools. */
  suidBinaries: string[];
  /** Loaded kernel modules — detect rootkits. */
  kernelModules: string[];
};
