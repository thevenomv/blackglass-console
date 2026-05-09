/**
 * Wait-for-fresh-push fallback in src/lib/server/collector/collect.ts.
 *
 * When the SSH pull fails for a host that has no other path
 * (DigitalOcean App Platform → Droplet egress is silently
 * blackholed), the collector falls back to the most recent
 * agent-pushed snapshot. The wait-for-fresh-push behaviour adds a
 * second layer: if the user is asking for a "live" scan
 * (`scanStartedAt` provided) AND the cached snapshot is older than
 * that timestamp, we briefly wait for a fresher push to arrive
 * before falling back to the stale one. Without this, a user who
 * introduced drift on a demo VM and immediately clicked Run scan
 * would always see "100% baseline alignment" because the cache
 * still held the pre-drift snapshot from the agent's previous push
 * cycle.
 *
 * Why the dynamic-import dance: `vi.resetModules()` in beforeEach
 * is required so each test gets a clean view of the collector
 * (env-driven configuration is read at module load). The
 * agent-snapshot-cache is also reset that way, so we MUST import
 * it AFTER resetModules in each test — otherwise the test's view
 * of the cache is a stale module instance the collector can't see.
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

function makeSnapshot(hostId: string, collectedAt: string): HostSnapshot {
  return {
    hostId,
    hostname: hostId,
    collectedAt,
    listeners: [],
    users: [],
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
  };
}

describe("collector wait-for-fresh-push fallback", () => {
  beforeEach(() => {
    process.env.COLLECTOR_HOST_1 = "10.0.0.1";
    process.env.SSH_PRIVATE_KEY = PEM;
    // Tight wait window so tests don't hang. 200ms is short enough
    // that the wait-then-fallback path completes in well under a
    // second, but long enough that a programmed delay (75ms) lands
    // comfortably inside it.
    process.env.COLLECTOR_AGENT_FRESH_WAIT_MS = "200";
    delete process.env.COLLECTOR_AGENT_FALLBACK_WINDOW_SECONDS;
    delete process.env.LAB_AGENT_FRESH_WINDOW_SECONDS;
    baselineMock.getBaseline.mockReset();
    baselineMock.getBaseline.mockResolvedValue(undefined);
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.COLLECTOR_HOST_1;
    delete process.env.SSH_PRIVATE_KEY;
    delete process.env.COLLECTOR_AGENT_FRESH_WAIT_MS;
    vi.resetModules();
  });

  it("returns immediately when the cached snapshot is newer than scanStartedAt", async () => {
    const cache = await import("@/lib/server/agent-snapshot-cache");
    cache._resetAgentSnapshotCacheForTests();
    const { collectAllSnapshots } = await import("@/lib/server/collector");

    const scanStartedAt = Date.now() - 5_000;
    cache.recordAgentSnapshot(
      makeSnapshot("host-10-0-0-1", new Date().toISOString()),
    );

    const t0 = Date.now();
    const results = await collectAllSnapshots({ scanStartedAt });
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(150);
    expect(results[0].snapshot).toBeDefined();
    expect(Date.parse(results[0].snapshot!.collectedAt)).toBeGreaterThanOrEqual(scanStartedAt);
  });

  it("returns a fresh push that lands during the wait window", async () => {
    const cache = await import("@/lib/server/agent-snapshot-cache");
    cache._resetAgentSnapshotCacheForTests();
    const { collectAllSnapshots } = await import("@/lib/server/collector");

    const scanStartedAt = Date.now();
    setTimeout(() => {
      cache.recordAgentSnapshot(
        makeSnapshot("host-10-0-0-1", new Date(scanStartedAt + 75).toISOString()),
      );
    }, 75);

    const results = await collectAllSnapshots({ scanStartedAt });
    expect(results[0].snapshot).toBeDefined();
    expect(Date.parse(results[0].snapshot!.collectedAt)).toBeGreaterThanOrEqual(scanStartedAt);
  });

  it("falls back to the stale cached snapshot when the wait expires", async () => {
    const cache = await import("@/lib/server/agent-snapshot-cache");
    cache._resetAgentSnapshotCacheForTests();
    const { collectAllSnapshots } = await import("@/lib/server/collector");

    const stale = makeSnapshot("host-10-0-0-1", new Date(Date.now() - 60_000).toISOString());
    cache.recordAgentSnapshot(stale);

    const scanStartedAt = Date.now();
    const t0 = Date.now();
    const results = await collectAllSnapshots({ scanStartedAt });
    const elapsed = Date.now() - t0;

    // Waited ~200ms (full window) then fell back to the stale entry.
    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(results[0].snapshot?.collectedAt).toBe(stale.collectedAt);
  });

  it("falls back to the baseline store when the cache is empty AND no fresh push arrives", async () => {
    const cache = await import("@/lib/server/agent-snapshot-cache");
    cache._resetAgentSnapshotCacheForTests();

    const baseline = makeSnapshot("host-10-0-0-1", new Date(Date.now() - 60_000).toISOString());
    baselineMock.getBaseline.mockResolvedValue(baseline);

    const { collectAllSnapshots } = await import("@/lib/server/collector");
    const results = await collectAllSnapshots({ scanStartedAt: Date.now() });
    expect(results[0].snapshot?.collectedAt).toBe(baseline.collectedAt);
  });

  it("does NOT wait when scanStartedAt is undefined (legacy callers)", async () => {
    const cache = await import("@/lib/server/agent-snapshot-cache");
    cache._resetAgentSnapshotCacheForTests();
    const { collectAllSnapshots } = await import("@/lib/server/collector");

    const stale = makeSnapshot("host-10-0-0-1", new Date(Date.now() - 60_000).toISOString());
    cache.recordAgentSnapshot(stale);

    const t0 = Date.now();
    const results = await collectAllSnapshots(); // no scanStartedAt
    const elapsed = Date.now() - t0;

    // Without scanStartedAt the wait branch is skipped entirely;
    // we use the cached snapshot immediately even though it predates
    // any plausible "now". Preserves behaviour for cron-driven
    // scheduled scans and tests.
    expect(elapsed).toBeLessThan(150);
    expect(results[0].snapshot?.collectedAt).toBe(stale.collectedAt);
  });
});
