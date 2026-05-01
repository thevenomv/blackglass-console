import type { DriftCategory, DriftEvent, FindingLifecycle } from "./types";

const categories: DriftCategory[] = [
  "network_exposure",
  "identity",
  "persistence",
  "ssh",
  "firewall",
  "packages",
];

const lifecycles: FindingLifecycle[] = [
  "new",
  "triaged",
  "accepted_risk",
  "remediated",
  "verified",
];

const synthetic: DriftEvent[] = [];
for (let i = 4; i <= 52; i++) {
  const hostNum = ((i - 1) % 12) + 1;
  synthetic.push({
    id: `d-${String(i).padStart(3, "0")}`,
    hostId: `host-${String(hostNum).padStart(2, "0")}`,
    category: categories[(i - 1) % categories.length],
    severity: (["high", "medium", "low"] as const)[(i - 1) % 3],
    lifecycle: lifecycles[(i - 1) % lifecycles.length],
    title: `Synthetic integrity delta · signal ${i}`,
    detectedAt: new Date(Date.UTC(2026, 4, 1, 10 - (i % 8), (i * 11) % 60, 0)).toISOString(),
    rationale:
      "Generated row for virtualization, saved-view filters, and lifecycle column demos — replace with collector payloads in production.",
    evidenceSummary: JSON.stringify({ seed: i, slice: categories[(i - 1) % categories.length] }),
    suggestedActions: ["Compare to active baseline", "Route to owner squad"],
  });
}

export const driftEvents: DriftEvent[] = [
  {
    id: "d-001",
    hostId: "host-07",
    category: "network_exposure",
    severity: "high",
    lifecycle: "triaged",
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
    provenance: {
      collector: "blackglass-collector v2.4 · host-07",
      confidenceLabel: "High — multi-signal correlation",
      modelVersion: "drift-engine 2026.04",
      verifiedAt: "2026-05-01T07:12:01Z",
    },
  },
  {
    id: "d-002",
    hostId: "host-03",
    category: "identity",
    severity: "high",
    lifecycle: "new",
    title: "New sudo-capable user",
    detectedAt: "2026-05-01T06:55:02Z",
    rationale:
      "Privileged accounts expand blast radius; unexpected additions often precede persistence.",
    evidenceSummary: "/etc/group sudo: …,deploy-bot",
    suggestedActions: [
      "Confirm provisioning workflow.",
      "Audit sudoers drop-ins for unintended NOPASSWD.",
    ],
    provenance: {
      collector: "identity-slice · LDAP hint",
      confidenceLabel: "Medium — NSS shadow delta",
      modelVersion: "drift-engine 2026.04",
      verifiedAt: "2026-05-01T06:54:50Z",
    },
  },
  {
    id: "d-003",
    hostId: "host-09",
    category: "persistence",
    severity: "medium",
    lifecycle: "accepted_risk",
    title: "Enabled systemd unit not in baseline",
    detectedAt: "2026-04-30T22:18:40Z",
    rationale:
      "Boot-resident units are a common persistence vector; alignment with baseline reduces unknown persistence.",
    evidenceSummary: "foobar.service enabled; WantedBy=multi-user.target",
    suggestedActions: ["Disable unit if not approved.", "Document vendor requirement if legitimate."],
    provenance: {
      collector: "systemd inventory sweep",
      confidenceLabel: "Medium — unit hash drift only",
      verifiedAt: "2026-04-30T22:18:33Z",
    },
  },
  ...synthetic,
];

export function getDriftEvent(id: string): DriftEvent | undefined {
  return driftEvents.find((e) => e.id === id);
}

export function getDriftEventsForHost(hostId: string): DriftEvent[] {
  return driftEvents.filter((e) => e.hostId === hostId);
}
