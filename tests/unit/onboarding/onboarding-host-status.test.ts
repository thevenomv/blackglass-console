/**
 * Tests for /api/v1/onboarding/host-status — the per-host state machine
 * the wizard polls during step 1.
 *
 * Pin down each terminal stage and the precedence of blocking checks
 * (tombstone > quota > captured > received > invalid > awaiting).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const hasBaselineMock = vi.hoisted(() => vi.fn(async () => false));
const getBaselineMock = vi.hoisted(() => vi.fn(async () => undefined as unknown));
const listBaselineHostIdsMock = vi.hoisted(() => vi.fn(async () => [] as string[]));
const isHostTombstonedMock = vi.hoisted(() => vi.fn(async () => null as unknown));
const getRecentAgentSnapshotMock = vi.hoisted(() => vi.fn(() => null as unknown));
const getSubscriptionForTenantMock = vi.hoisted(() =>
  vi.fn(async () => null as unknown),
);

vi.mock("@/lib/server/baseline-store", () => ({
  hasBaseline: hasBaselineMock,
  getBaseline: getBaselineMock,
  listBaselineHostIds: listBaselineHostIdsMock,
}));
vi.mock("@/lib/server/host-tombstones", () => ({
  isHostTombstoned: isHostTombstonedMock,
}));
vi.mock("@/lib/server/agent-snapshot-cache", () => ({
  getRecentAgentSnapshot: getRecentAgentSnapshotMock,
}));
vi.mock("@/lib/saas/tenant-service", () => ({
  getSubscriptionForTenant: getSubscriptionForTenantMock,
}));
vi.mock("@/lib/saas/clerk-mode", () => ({
  isClerkAuthEnabled: () => false,
}));
vi.mock("@/lib/server/http/auth-guard", () => ({
  requireRole: async () => ({ ok: true, role: "admin" }),
}));
vi.mock("@/lib/server/http/saas-access", () => ({
  requireSaasOrLegacyPermission: async () => ({ ok: true, mode: "legacy", role: "admin" }),
}));

beforeEach(() => {
  hasBaselineMock.mockReset();
  hasBaselineMock.mockResolvedValue(false);
  getBaselineMock.mockReset();
  getBaselineMock.mockResolvedValue(undefined);
  listBaselineHostIdsMock.mockReset();
  listBaselineHostIdsMock.mockResolvedValue([]);
  isHostTombstonedMock.mockReset();
  isHostTombstonedMock.mockResolvedValue(null);
  getRecentAgentSnapshotMock.mockReset();
  getRecentAgentSnapshotMock.mockReturnValue(null);
  getSubscriptionForTenantMock.mockReset();
  getSubscriptionForTenantMock.mockResolvedValue(null);
  delete process.env.INGEST_SAAS_TENANT_ID;
});

async function call(hostId: string): Promise<Response> {
  const { GET } = await import("@/app/api/v1/onboarding/host-status/route");
  return GET(
    new Request(
      `http://localhost/api/v1/onboarding/host-status?hostId=${encodeURIComponent(hostId)}`,
    ),
  );
}

describe("/api/v1/onboarding/host-status", () => {
  it("returns awaiting_first_push when no baseline and no cached snapshot", async () => {
    const res = await call("host-1-2-3-4");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stage: string };
    expect(body.stage).toBe("awaiting_first_push");
  });

  it("returns blocked_tombstone when host is tombstoned (highest precedence)", async () => {
    isHostTombstonedMock.mockResolvedValueOnce({
      hostId: "host-1-2-3-4",
      tenantId: null,
      hostname: "x",
      deletedBy: null,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    // Even with a baseline present, tombstone wins.
    hasBaselineMock.mockResolvedValueOnce(true);
    const res = await call("host-1-2-3-4");
    const body = (await res.json()) as { stage: string; expiresAt?: string };
    expect(body.stage).toBe("blocked_tombstone");
    expect(body.expiresAt).toBe("2099-01-01T00:00:00.000Z");
  });

  it("returns baseline_captured with summary when baseline exists", async () => {
    hasBaselineMock.mockResolvedValueOnce(true);
    getBaselineMock.mockResolvedValueOnce({
      hostId: "host-1-2-3-4",
      hostname: "lab",
      collectedAt: "2026-05-09T00:00:00.000Z",
      listeners: [{ proto: "tcp", bind: "0.0.0.0", port: 22 }],
      users: [{ username: "alice", uid: 1000 }],
      sudoers: [],
      sudoersFiles: [],
      cronEntries: [],
      userCrontabs: [],
      services: [{ unit: "ssh.service" }],
      ssh: { permitRootLogin: "no", passwordAuthentication: "no" },
      firewall: { active: true, rules: [] },
      authorizedKeys: [],
      fileHashes: [],
      hostsEntries: [],
      kernelModules: [],
      suidBinaries: [],
      installedPackages: [],
      systemdUnitFiles: [],
    });
    const res = await call("host-1-2-3-4");
    const body = (await res.json()) as {
      stage: string;
      capturedAt?: string;
      summary?: { listeners: number; users: number; services: number };
    };
    expect(body.stage).toBe("baseline_captured");
    expect(body.capturedAt).toBe("2026-05-09T00:00:00.000Z");
    expect(body.summary?.listeners).toBe(1);
    expect(body.summary?.users).toBe(1);
    expect(body.summary?.services).toBe(1);
  });

  it("returns bundle_invalid when cached snapshot is missing required sections", async () => {
    hasBaselineMock.mockResolvedValueOnce(false);
    getRecentAgentSnapshotMock.mockReturnValueOnce({
      hostId: "host-1-2-3-4",
      hostname: "lab",
      collectedAt: new Date().toISOString(),
      listeners: [],
      users: [],
      ssh: {},
      services: [],
      sudoers: [],
      sudoersFiles: [],
      cronEntries: [],
      userCrontabs: [],
      firewall: { active: true, rules: [] },
      authorizedKeys: [],
      fileHashes: [],
      hostsEntries: [],
      kernelModules: [],
      suidBinaries: [],
      installedPackages: [],
      systemdUnitFiles: [],
    });
    const res = await call("host-1-2-3-4");
    const body = (await res.json()) as {
      stage: string;
      missing?: string[];
    };
    expect(body.stage).toBe("bundle_invalid");
    expect(body.missing).toEqual(expect.arrayContaining(["listeners", "users", "ssh"]));
  });

  it("returns bundle_received when cached snapshot has all required sections", async () => {
    hasBaselineMock.mockResolvedValueOnce(false);
    getRecentAgentSnapshotMock.mockReturnValueOnce({
      hostId: "host-1-2-3-4",
      hostname: "lab",
      collectedAt: new Date().toISOString(),
      listeners: [{ proto: "tcp", bind: "0.0.0.0", port: 22 }],
      users: [{ username: "alice", uid: 1000 }],
      ssh: { permitRootLogin: "no", passwordAuthentication: "no" },
      services: [{ unit: "ssh.service" }],
      sudoers: [],
      sudoersFiles: [],
      cronEntries: [],
      userCrontabs: [],
      firewall: { active: true, rules: [] },
      authorizedKeys: [],
      fileHashes: [],
      hostsEntries: [],
      kernelModules: [],
      suidBinaries: [],
      installedPackages: [],
      systemdUnitFiles: [],
    });
    const res = await call("host-1-2-3-4");
    const body = (await res.json()) as { stage: string; summary?: { listeners: number } };
    expect(body.stage).toBe("bundle_received");
    expect(body.summary?.listeners).toBe(1);
  });

  it("rejects invalid hostId with 400", async () => {
    const res = await call("");
    expect(res.status).toBe(400);
  });
});
