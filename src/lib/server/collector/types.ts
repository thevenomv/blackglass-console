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
};

export type FirewallStatus = {
  active: boolean;
  defaultInbound: string;
  rules: string[];
};

export type CronEntry = {
  filename: string;
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
  services: RunningService[];
  ssh: SSHConfig;
  firewall: FirewallStatus;
};
