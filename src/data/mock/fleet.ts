import type { FleetSnapshot } from "./types";

export const fleetSnapshot: FleetSnapshot = {
  hostsChecked: 12,
  highRiskDrift: 3,
  readyHosts: 7,
  evidenceBundles: 2,
  driftVolumeByDay: [
    { day: "Mon", valuePct: 40 },
    { day: "Tue", valuePct: 55 },
    { day: "Wed", valuePct: 48 },
    { day: "Thu", valuePct: 72 },
    { day: "Fri", valuePct: 64 },
  ],
  fleetBullets: [
    "7 hosts match baseline.",
    "3 hosts show high-risk drift.",
    "2 hosts require privileged re-check.",
  ],
  notableEvents: [
    {
      hostId: "host-07",
      slug: "tcp-4444",
      label: "unexpected TCP listener on 4444",
    },
    {
      hostId: "host-03",
      slug: "sudo-user",
      label: "new sudo-capable user detected",
    },
    {
      hostId: "host-09",
      slug: "systemd",
      label: "new persistent systemd service enabled",
    },
  ],
};
