import type { DriftEvent } from "./types";

export const driftEvents: DriftEvent[] = [
  {
    id: "d-001",
    hostId: "host-07",
    category: "network_exposure",
    severity: "high",
    title: "Unexpected TCP listener",
    detectedAt: "2026-05-01T07:12:14Z",
    rationale:
      "A new listener on all interfaces increases lateral movement options and bypasses inbound assumptions baked into your baseline.",
    evidenceSummary:
      "LISTEN 0 128 0.0.0.0:4444 (userspace) — process fingerprint unavailable",
    suggestedActions: [
      "Validate owner service and change ticket.",
      "If unintended, terminate listener and reload firewall.",
      "Re-scan after remediation to close finding.",
    ],
  },
  {
    id: "d-002",
    hostId: "host-03",
    category: "identity",
    severity: "high",
    title: "New sudo-capable user",
    detectedAt: "2026-05-01T06:55:02Z",
    rationale:
      "Privileged accounts expand blast radius; unexpected additions often precede persistence.",
    evidenceSummary: "/etc/group sudo: …,deploy-bot",
    suggestedActions: [
      "Confirm provisioning workflow.",
      "Audit sudoers drop-ins for unintended NOPASSWD.",
    ],
  },
  {
    id: "d-003",
    hostId: "host-09",
    category: "persistence",
    severity: "medium",
    title: "Enabled systemd unit not in baseline",
    detectedAt: "2026-04-30T22:18:40Z",
    rationale:
      "Boot-resident units are a common persistence vector; alignment with baseline reduces unknown persistence.",
    evidenceSummary: "foobar.service enabled; WantedBy=multi-user.target",
    suggestedActions: ["Disable unit if not approved.", "Document vendor requirement if legitimate."],
  },
];

export function getDriftEvent(id: string): DriftEvent | undefined {
  return driftEvents.find((e) => e.id === id);
}

export function getDriftEventsForHost(hostId: string): DriftEvent[] {
  return driftEvents.filter((e) => e.hostId === hostId);
}
