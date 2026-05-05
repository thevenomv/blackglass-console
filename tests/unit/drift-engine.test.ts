import { describe, expect, it } from "vitest";
import { computeDrift } from "@/lib/server/drift-engine";
import type { HostSnapshot } from "@/lib/server/collector";

function baseSnap(overrides: Partial<HostSnapshot> = {}): HostSnapshot {
  const base: HostSnapshot = {
    hostId: "host-test",
    hostname: "test",
    collectedAt: "2026-01-01T00:00:00.000Z",
    listeners: [{ proto: "tcp", bind: "0.0.0.0", port: 22 }],
    users: [{ username: "alice", uid: 1000 }],
    sudoers: [],
    sudoersFiles: [],
    cronEntries: [],
    userCrontabs: [],
    services: [{ unit: "ssh.service", sub: "running" }],
    ssh: { permitRootLogin: "no", passwordAuthentication: "no" },
    firewall: { active: true, defaultInbound: "deny", rules: [] },
    authorizedKeys: [],
    fileHashes: [],
    hostsEntries: [],
    suidBinaries: [],
    kernelModules: [],
  };
  return { ...base, ...overrides };
}

describe("computeDrift", () => {
  it("returns empty when baseline matches current", () => {
    const s = baseSnap();
    expect(computeDrift(s, s)).toEqual([]);
  });

  it("detects new privileged listener as network drift", () => {
    const baseline = baseSnap();
    const current = baseSnap({
      listeners: [
        ...baseline.listeners,
        { proto: "tcp", bind: "0.0.0.0", port: 4444, process: "nc" },
      ],
    });
    const ev = computeDrift(baseline, current);
    expect(ev.length).toBe(1);
    expect(ev[0].category).toBe("network_exposure");
    expect(ev[0].severity).toBe("medium");
  });

  it("detects new login user as identity drift", () => {
    const baseline = baseSnap({ users: [{ username: "alice", uid: 1000 }] });
    const current = baseSnap({
      users: [
        { username: "alice", uid: 1000 },
        { username: "bob", uid: 1001 },
      ],
    });
    const ev = computeDrift(baseline, current);
    const userEv = ev.filter((e) => e.category === "identity");
    expect(userEv.length).toBeGreaterThanOrEqual(1);
    expect(userEv.some((e) => e.title.includes("bob"))).toBe(true);
  });
});
