import type { HostDetail, HostRecord } from "./types";

export const hosts: HostRecord[] = [
  {
    id: "host-07",
    hostname: "host-07",
    os: "Ubuntu 22.04",
    trust: "drift",
    lastScanAt: "2026-05-01T09:41:00Z",
    baselineAligned: false,
    readinessScore: 61,
  },
  {
    id: "host-03",
    hostname: "host-03",
    os: "Debian 12",
    trust: "needs_review",
    lastScanAt: "2026-05-01T09:38:00Z",
    baselineAligned: false,
    readinessScore: 54,
  },
  {
    id: "host-09",
    hostname: "host-09",
    os: "RHEL 9",
    trust: "drift",
    lastScanAt: "2026-05-01T09:35:00Z",
    baselineAligned: false,
    readinessScore: 72,
  },
  {
    id: "host-12",
    hostname: "host-12",
    os: "Ubuntu 24.04",
    trust: "aligned",
    lastScanAt: "2026-05-01T09:30:00Z",
    baselineAligned: true,
    readinessScore: 94,
  },
  {
    id: "host-01",
    hostname: "host-01",
    os: "Ubuntu 22.04",
    trust: "aligned",
    lastScanAt: "2026-05-01T09:28:00Z",
    baselineAligned: true,
    readinessScore: 91,
  },
  {
    id: "host-22",
    hostname: "host-22",
    os: "Rocky 9",
    trust: "critical",
    lastScanAt: "2026-05-01T08:55:00Z",
    baselineAligned: false,
    readinessScore: 38,
  },
];

const details: Record<string, HostDetail> = {
  "host-07": {
    ...hosts[0],
    baselineId: "bl-host-07-prod",
    baselineLabel: "prod-bootstrap-2026-04-12",
    integrityBars: {
      networkListenersInvestigation: 72,
      userGroupDrift: 88,
      systemdPersistence: 34,
      evidenceCompleteness: 61,
    },
    deltaCounts: {
      "Network exposure": 2,
      "Identity / privilege": 1,
      "Systemd persistence": 0,
      "SSH posture": 0,
      "Firewall": 1,
      "Packages / kernel": 0,
    },
    ports: [
      {
        proto: "tcp",
        bind: "0.0.0.0",
        port: 22,
        process: "sshd",
        baselineMatch: true,
      },
      {
        proto: "tcp",
        bind: "0.0.0.0",
        port: 4444,
        process: "unknown",
        baselineMatch: false,
      },
    ],
    users: [
      {
        user: "admin",
        uid: 1000,
        groups: ["admin", "sudo"],
        sudoCapable: true,
        baselineMatch: true,
      },
      {
        user: "deploy-bot",
        uid: 1002,
        groups: ["sudo"],
        sudoCapable: true,
        baselineMatch: false,
      },
    ],
    services: [
      {
        unit: "ssh.service",
        state: "active",
        enabled: true,
        baselineMatch: true,
      },
      {
        unit: "blackglass-collector.service",
        state: "active",
        enabled: true,
        baselineMatch: true,
      },
    ],
    sshFirewall: {
      sshPermitRoot: "prohibit-password",
      sshPasswordAuth: false,
      baselineMatchSsh: true,
      firewallBackend: "nftables",
      defaultPolicy: "drop",
      baselineMatchFw: false,
    },
    timeline: [
      {
        at: "2026-05-01T09:41:00Z",
        label: "Scan completed",
        detail: "2 high-risk findings queued for review",
      },
      {
        at: "2026-05-01T07:12:00Z",
        label: "Listener drift",
        detail: "0.0.0.0:4444 not present in baseline",
        severity: "high",
      },
      {
        at: "2026-04-30T21:03:00Z",
        label: "Evidence bundle exported",
        detail: "INC-2047 — security review",
      },
    ],
  },
};

export function getHostRecord(id: string): HostRecord | undefined {
  return hosts.find((h) => h.id === id);
}

export function getHostDetail(id: string): HostDetail | undefined {
  return details[id] ?? buildFallbackDetail(id);
}

function buildFallbackDetail(id: string): HostDetail | undefined {
  const base = hosts.find((h) => h.id === id);
  if (!base) return undefined;
  return {
    ...base,
    baselineId: `bl-${id}`,
    baselineLabel: "default-baseline",
    integrityBars: {
      networkListenersInvestigation: 45,
      userGroupDrift: 22,
      systemdPersistence: 18,
      evidenceCompleteness: 55,
    },
    deltaCounts: {
      "Network exposure": 0,
      "Identity / privilege": 0,
      "Systemd persistence": 0,
      "SSH posture": 0,
      "Firewall": 0,
      "Packages / kernel": 0,
    },
    ports: [
      {
        proto: "tcp",
        bind: "0.0.0.0",
        port: 22,
        process: "sshd",
        baselineMatch: true,
      },
    ],
    users: [
      {
        user: "root",
        uid: 0,
        groups: ["root"],
        sudoCapable: false,
        baselineMatch: true,
      },
    ],
    services: [
      {
        unit: "ssh.service",
        state: "active",
        enabled: true,
        baselineMatch: true,
      },
    ],
    sshFirewall: {
      sshPermitRoot: "no",
      sshPasswordAuth: false,
      baselineMatchSsh: true,
      firewallBackend: "iptables",
      defaultPolicy: "accept",
      baselineMatchFw: true,
    },
    timeline: [
      {
        at: base.lastScanAt,
        label: "Scan completed",
        detail: "No high-risk drift detected",
      },
    ],
  };
}
