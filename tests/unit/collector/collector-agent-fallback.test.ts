/**
 * Agent fallback in src/lib/server/collector/collect.ts.
 *
 * When the SSH pull fails — the dominant failure mode when BLACKGLASS
 * runs on DigitalOcean App Platform, since the DO network fabric
 * silently blackholes egress to other user-owned Droplets — collect.ts
 * looks up the same hostId in the baseline store and, if a recent
 * agent-pushed snapshot is found, uses it as a drop-in substitute.
 *
 * These tests exercise that fallback in isolation by mocking ssh2 to
 * fail and the baseline store to serve a controlled snapshot.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostSnapshot } from "@/lib/server/collector/types";

vi.mock("net", () => ({
  createConnection: () => {
    const socket = {
      setTimeout: () => socket,
      destroy: () => {},
      on(ev: string, fn: (...args: unknown[]) => void) {
        if (ev === "connect") queueMicrotask(() => fn());
        return socket;
      },
    };
    return socket;
  },
}));

vi.mock("ssh2", () => {
  class FailingClient {
    private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    on(ev: string, fn: (...args: unknown[]) => void) {
      (this.handlers[ev] ??= []).push(fn);
    }
    connect() {
      queueMicrotask(() => {
        this.handlers["error"]?.forEach((f) => f(new Error("ECONNREFUSED")));
      });
    }
    end() {}
    destroy() {}
  }
  return { Client: FailingClient };
});

const baselineMock = vi.hoisted(() => ({
  getBaseline: vi.fn<(hostId: string) => Promise<HostSnapshot | undefined>>(async () => undefined),
  saveBaseline: vi.fn(async () => {}),
  listBaselineHostIds: vi.fn(async () => [] as string[]),
  hasBaseline: vi.fn(async () => false),
  baselineStoreHealth: () => ({ kind: "memory" as const }),
}));
vi.mock("@/lib/server/baseline-store", () => baselineMock);

const PEM =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz\n-----END OPENSSH PRIVATE KEY-----";

function makeSnapshot(overrides: Partial<HostSnapshot> = {}): HostSnapshot {
  return {
    hostId: "host-10-0-0-1",
    hostname: "lab-01",
    collectedAt: new Date().toISOString(),
    listeners: [{ proto: "tcp", bind: "0.0.0.0", port: 22, process: "sshd" }],
    users: [{ username: "blackglass", uid: 1000 }],
    sudoers: [],
    sudoersFiles: [],
    cronEntries: [],
    userCrontabs: [],
    services: [],
    ssh: { permitRootLogin: "no", passwordAuthentication: "no" },
    firewall: { active: true, defaultInbound: "deny", rules: [] },
    authorizedKeys: [],
    fileHashes: [],
    hostsEntries: [],
    suidBinaries: [],
    kernelModules: [],
    installedPackages: [],
    systemdUnitFiles: [],
    ...overrides,
  };
}

describe("collector agent fallback (when SSH fails)", () => {
  beforeEach(() => {
    process.env.COLLECTOR_HOST_1 = "10.0.0.1";
    process.env.SSH_PRIVATE_KEY = PEM;
    delete process.env.COLLECTOR_AGENT_FALLBACK_WINDOW_SECONDS;
    delete process.env.LAB_AGENT_FRESH_WINDOW_SECONDS;
    baselineMock.getBaseline.mockReset();
    baselineMock.getBaseline.mockResolvedValue(undefined);
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.COLLECTOR_HOST_1;
    delete process.env.SSH_PRIVATE_KEY;
    vi.resetModules();
  });

  it("collectAllSnapshots returns the agent snapshot when SSH fails and a fresh push exists", async () => {
    const fresh = makeSnapshot({ collectedAt: new Date(Date.now() - 60_000).toISOString() });
    baselineMock.getBaseline.mockResolvedValue(fresh);

    const { collectAllSnapshots } = await import("@/lib/server/collector");
    const results = await collectAllSnapshots();
    expect(results).toHaveLength(1);
    expect(results[0]!.snapshot).toBeDefined();
    expect(results[0]!.snapshot?.hostId).toBe("host-10-0-0-1");
    expect(results[0]!.error).toBeUndefined();
    expect(baselineMock.getBaseline).toHaveBeenCalledWith("host-10-0-0-1");
  });

  it("collectAllSnapshots surfaces the SSH error when the agent snapshot is too old", async () => {
    process.env.COLLECTOR_AGENT_FALLBACK_WINDOW_SECONDS = "300";
    const stale = makeSnapshot({ collectedAt: new Date(Date.now() - 600_000).toISOString() });
    baselineMock.getBaseline.mockResolvedValue(stale);

    const { collectAllSnapshots } = await import("@/lib/server/collector");
    const results = await collectAllSnapshots();
    expect(results[0]!.snapshot).toBeUndefined();
    expect(results[0]!.error).toMatch(/SSH connection error/);
  });

  it("collectAllSnapshots surfaces the SSH error when no agent snapshot exists", async () => {
    baselineMock.getBaseline.mockResolvedValue(undefined);
    const { collectAllSnapshots } = await import("@/lib/server/collector");
    const results = await collectAllSnapshots();
    expect(results[0]!.snapshot).toBeUndefined();
    expect(results[0]!.error).toMatch(/SSH connection error/);
  });

  it("collectSnapshot returns the agent snapshot when SSH fails and a fresh push exists", async () => {
    const fresh = makeSnapshot({ collectedAt: new Date(Date.now() - 30_000).toISOString() });
    baselineMock.getBaseline.mockResolvedValue(fresh);
    const { collectSnapshot } = await import("@/lib/server/collector");
    const snap = await collectSnapshot();
    expect(snap.hostId).toBe("host-10-0-0-1");
    expect(snap.collectedAt).toBe(fresh.collectedAt);
  });

  it("collectSnapshot still throws when SSH fails AND no agent snapshot is available", async () => {
    baselineMock.getBaseline.mockResolvedValue(undefined);
    const { collectSnapshot } = await import("@/lib/server/collector");
    await expect(collectSnapshot()).rejects.toThrow(/SSH connection error/);
  });
});
