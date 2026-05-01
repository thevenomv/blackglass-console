import type { BaselineDiffCategory, BaselineSnapshotMeta } from "./types";

export const baselineSnapshots: BaselineSnapshotMeta[] = [
  {
    id: "bl-host-07-prod",
    label: "prod-bootstrap-2026-04-12",
    hostId: "host-07",
    pinnedAt: "2026-04-12T18:02:00Z",
    scanId: "scan-9182",
    superseded: false,
  },
  {
    id: "bl-host-07-prev",
    label: "prod-bootstrap-2026-03-01",
    hostId: "host-07",
    pinnedAt: "2026-03-01T09:15:00Z",
    scanId: "scan-7711",
    superseded: true,
  },
];

export const baselineDiffByHost: Record<string, BaselineDiffCategory[]> = {
  "host-07": [
    {
      id: "network",
      label: "Network exposure",
      rows: [
        {
          path: "listeners.tcp",
          change: "added",
          severity: "high",
          summary: "New TCP listener bound on all interfaces.",
          before: "22/sshd",
          after: "22/sshd, 4444/unknown",
        },
      ],
    },
    {
      id: "identity",
      label: "Identity / privilege",
      rows: [
        {
          path: "users.sudo_group.members",
          change: "added",
          severity: "medium",
          summary: "New privileged principal requires review.",
          before: "admin",
          after: "admin, deploy-bot",
        },
      ],
    },
    {
      id: "firewall",
      label: "Firewall",
      rows: [
        {
          path: "nftables.filter.input.default",
          change: "changed",
          severity: "medium",
          summary: "Default input policy diverged from baseline.",
          before: "drop",
          after: "accept",
        },
      ],
    },
  ],
};

export function getBaselineSnapshots(hostId: string): BaselineSnapshotMeta[] {
  return baselineSnapshots.filter((s) => s.hostId === hostId);
}

export function getBaselineDiff(hostId: string): BaselineDiffCategory[] {
  return baselineDiffByHost[hostId] ?? [];
}
