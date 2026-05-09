/**
 * Tests for /api/v1/onboarding/reset — the "start over" cascade for a
 * single host. Confirms tombstone clear + baseline delete + drift purge
 * + agent snapshot cache eviction all happen, and that the response
 * carries the install URL the wizard needs.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const clearTombstoneMock = vi.hoisted(() => vi.fn(async () => true));
const deleteBaselineMock = vi.hoisted(() => vi.fn(async () => true));
const deleteDriftEventsMock = vi.hoisted(() => vi.fn(async () => true));
const clearAgentSnapshotMock = vi.hoisted(() => vi.fn(() => true));
const appendAuditMock = vi.hoisted(() => vi.fn());
const emitSaasAuditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/host-tombstones", () => ({
  clearTombstone: clearTombstoneMock,
}));
vi.mock("@/lib/server/baseline-store", () => ({
  deleteBaseline: deleteBaselineMock,
}));
vi.mock("@/lib/server/drift-engine", () => ({
  deleteDriftEvents: deleteDriftEventsMock,
}));
vi.mock("@/lib/server/agent-snapshot-cache", () => ({
  clearAgentSnapshot: clearAgentSnapshotMock,
}));
vi.mock("@/lib/server/audit-log", () => ({
  appendAudit: appendAuditMock,
  AUDIT_ACTIONS: { HOST_DELETED: "host_deleted" },
}));
vi.mock("@/lib/saas/event-log", () => ({
  emitSaasAudit: emitSaasAuditMock,
}));
vi.mock("@/lib/server/integrity-revalidate", () => ({
  revalidateIntegritySurfaces: vi.fn(),
}));
vi.mock("@/lib/saas/clerk-mode", () => ({
  isClerkAuthEnabled: () => false,
}));
vi.mock("@/lib/server/http/auth-guard", () => ({
  requireRole: async () => ({ ok: true, role: "admin" }),
}));
vi.mock("@/lib/saas/operations", () => ({
  canRunScansForTenant: () => true,
}));

beforeEach(() => {
  clearTombstoneMock.mockReset().mockResolvedValue(true);
  deleteBaselineMock.mockReset().mockResolvedValue(true);
  deleteDriftEventsMock.mockReset().mockResolvedValue(true);
  clearAgentSnapshotMock.mockReset().mockReturnValue(true);
  appendAuditMock.mockReset();
  emitSaasAuditMock.mockReset();
});

async function call(body: unknown): Promise<Response> {
  const { POST } = await import("../../src/app/api/v1/onboarding/reset/route");
  return POST(
    new Request("http://localhost/api/v1/onboarding/reset", {
      method: "POST",
      headers: { "content-type": "application/json", host: "blackglasssec.com" },
      body: JSON.stringify(body),
    }),
  );
}

describe("/api/v1/onboarding/reset", () => {
  it("runs the full cascade for a known host", async () => {
    const res = await call({ hostId: "host-167-99-59-55" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      cascade: {
        tombstoneCleared: boolean;
        baselineRemoved: boolean;
        driftRemoved: boolean;
        cacheCleared: boolean;
      };
      next: { install_url: string; wizard_url: string };
    };
    expect(body.ok).toBe(true);
    expect(body.cascade).toEqual({
      tombstoneCleared: true,
      baselineRemoved: true,
      driftRemoved: true,
      cacheCleared: true,
    });

    expect(clearTombstoneMock).toHaveBeenCalledWith("host-167-99-59-55", null);
    expect(deleteBaselineMock).toHaveBeenCalledWith("host-167-99-59-55");
    expect(deleteDriftEventsMock).toHaveBeenCalledWith("host-167-99-59-55");
    expect(clearAgentSnapshotMock).toHaveBeenCalledWith("host-167-99-59-55");

    expect(body.next.install_url).toContain("/install-agent.sh?host=host-167-99-59-55");
    expect(body.next.wizard_url).toContain("/onboarding");

    expect(appendAuditMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed hostId", async () => {
    const res = await call({ hostId: "" });
    expect(res.status).toBe(400);
    expect(deleteBaselineMock).not.toHaveBeenCalled();
  });

  it("returns 502 if baseline delete throws", async () => {
    deleteBaselineMock.mockRejectedValueOnce(new Error("boom"));
    const res = await call({ hostId: "host-1-2-3-4" });
    expect(res.status).toBe(502);
  });

  it("is idempotent — succeeds even when nothing was actually present", async () => {
    clearTombstoneMock.mockResolvedValueOnce(false);
    deleteBaselineMock.mockResolvedValueOnce(false);
    deleteDriftEventsMock.mockResolvedValueOnce(false);
    clearAgentSnapshotMock.mockReturnValueOnce(false);

    const res = await call({ hostId: "host-no-such-host" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
