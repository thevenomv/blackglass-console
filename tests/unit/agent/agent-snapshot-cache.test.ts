/**
 * Unit tests for src/lib/server/agent-snapshot-cache.ts.
 *
 * These cover the cache itself and prove the freshness check works
 * against `collectedAt` so a cached push older than the configured
 * window does NOT satisfy a fallback. End-to-end behaviour (cache hit
 * wins over baseline) is also covered in collector-agent-fallback.test.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  recordAgentSnapshot,
  getRecentAgentSnapshot,
  agentSnapshotCacheSize,
  _resetAgentSnapshotCacheForTests,
} from "@/lib/server/agent-snapshot-cache";
import type { HostSnapshot } from "@/lib/server/collector/types";

function makeSnapshot(hostId: string, collectedAt = new Date().toISOString()): HostSnapshot {
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

describe("agent-snapshot-cache", () => {
  beforeEach(() => {
    _resetAgentSnapshotCacheForTests();
  });

  afterEach(() => {
    _resetAgentSnapshotCacheForTests();
  });

  it("returns null for an unknown host", () => {
    expect(getRecentAgentSnapshot("host-unknown", 600)).toBeNull();
  });

  it("returns the snapshot when within the freshness window", () => {
    const snap = makeSnapshot("host-10-0-0-1", new Date(Date.now() - 60_000).toISOString());
    recordAgentSnapshot(snap);
    const got = getRecentAgentSnapshot("host-10-0-0-1", 600);
    expect(got?.hostId).toBe("host-10-0-0-1");
  });

  it("treats snapshots older than the window as stale", () => {
    const snap = makeSnapshot("host-10-0-0-2", new Date(Date.now() - 1_800_000).toISOString());
    recordAgentSnapshot(snap);
    expect(getRecentAgentSnapshot("host-10-0-0-2", 600)).toBeNull();
  });

  it("falls back to recordedAt when collectedAt is unparseable", () => {
    const snap = makeSnapshot("host-10-0-0-3", "not-a-real-date");
    recordAgentSnapshot(snap);
    expect(getRecentAgentSnapshot("host-10-0-0-3", 600)?.hostId).toBe("host-10-0-0-3");
  });

  it("overwrites the previous entry when the same host pushes again", () => {
    const first = makeSnapshot("host-10-0-0-4", new Date(Date.now() - 200_000).toISOString());
    const second = makeSnapshot("host-10-0-0-4", new Date(Date.now() - 5_000).toISOString());
    recordAgentSnapshot(first);
    recordAgentSnapshot(second);
    const got = getRecentAgentSnapshot("host-10-0-0-4", 60);
    expect(got?.collectedAt).toBe(second.collectedAt);
  });

  it("ignores snapshots without a hostId", () => {
    recordAgentSnapshot(makeSnapshot(""));
    expect(agentSnapshotCacheSize()).toBe(0);
  });
});
