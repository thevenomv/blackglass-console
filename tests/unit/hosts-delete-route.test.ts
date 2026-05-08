/**
 * Tests for DELETE /api/v1/hosts/[id] — the "obvious delete host" cascade
 * surfaced from /hosts and /hosts/[id].
 *
 * What we pin down here:
 *   - Auth gate runs (legacy admin path; SaaS step-up path is exercised
 *     by the saas-access unit tests directly).
 *   - 404 when nothing was actually removed (host wasn't in any store).
 *   - 204 + cascade calls (baseline + drift) when something WAS removed.
 *   - Audit log + revalidate are fired exactly once on success.
 *   - Path id validation rejects garbage.
 *
 * The Postgres collector_hosts cleanup branch only runs in SaaS mode
 * (tenantId set), so we assert it is NOT called on the legacy path. The
 * SaaS branch uses the same `withTenantRls` plumbing every other route
 * uses; we trust that integration via end-to-end tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

type AuthResult =
  | { ok: true; ctx?: { tenant: { id: string }; userId: string } }
  | { ok: false; response: Response };

const deleteBaselineMock = vi.hoisted(() => vi.fn<(id: string) => Promise<boolean>>());
const getBaselineMock = vi.hoisted(() => vi.fn<(id: string) => Promise<unknown>>());
const deleteDriftEventsMock = vi.hoisted(() => vi.fn<(id: string) => Promise<boolean>>());
const requireRoleMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<AuthResult>>());
const requireSaasStepUpMutationMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<AuthResult>>(),
);
const isClerkAuthEnabledMock = vi.hoisted(() => vi.fn<() => boolean>());
const emitSaasAuditMock = vi.hoisted(() => vi.fn<(args: unknown) => Promise<void>>());
const appendAuditMock = vi.hoisted(() => vi.fn<(entry: unknown) => void>());
const revalidateIntegritySurfacesMock = vi.hoisted(() => vi.fn<() => void>());
const loadHostsMock = vi.hoisted(() => vi.fn<() => Promise<unknown[]>>());
const withTenantRlsMock = vi.hoisted(() =>
  vi.fn<(tenantId: string, fn: unknown) => Promise<{ id: string }[]>>(),
);

vi.mock("@/lib/server/baseline-store", () => ({
  deleteBaseline: deleteBaselineMock,
  getBaseline: getBaselineMock,
}));
vi.mock("@/lib/server/drift-engine", () => ({
  deleteDriftEvents: deleteDriftEventsMock,
}));
vi.mock("@/lib/server/http/auth-guard", () => ({
  requireRole: requireRoleMock,
}));
vi.mock("@/lib/server/http/saas-access", () => ({
  requireSaasOrLegacyPermission: vi.fn(async () => ({ ok: true })),
  requireSaasStepUpMutation: requireSaasStepUpMutationMock,
}));
vi.mock("@/lib/saas/clerk-mode", () => ({
  isClerkAuthEnabled: isClerkAuthEnabledMock,
}));
vi.mock("@/lib/saas/operations", () => ({
  canRunScansForTenant: () => ({ ok: true }),
}));
vi.mock("@/lib/saas/event-log", () => ({
  emitSaasAudit: emitSaasAuditMock,
}));
vi.mock("@/lib/server/audit-log", () => ({
  appendAudit: appendAuditMock,
  AUDIT_ACTIONS: {
    HOST_DELETED: "host.deleted",
    SCAN_COMPLETED: "scan.completed",
  },
}));
vi.mock("@/lib/server/integrity-revalidate", () => ({
  revalidateIntegritySurfaces: revalidateIntegritySurfacesMock,
}));
vi.mock("@/lib/server/inventory", () => ({
  loadHosts: loadHostsMock,
}));
vi.mock("@/lib/server/rate-limit", () => ({
  checkReadApiRate: vi.fn(async () => true),
  clientIp: () => "127.0.0.1",
}));
vi.mock("@/db", () => ({
  withTenantRls: withTenantRlsMock,
  schema: {
    saasCollectorHosts: {
      id: "id",
      tenantId: "tenant_id",
      hostname: "hostname",
    },
  },
}));
// drizzle-orm helpers — only invoked by the SaaS branch; return inert
// sentinel objects so import works without a real query builder.
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ _kind: "and", args }),
  eq: (a: unknown, b: unknown) => ({ _kind: "eq", a, b }),
}));

beforeEach(() => {
  deleteBaselineMock.mockReset().mockResolvedValue(false);
  getBaselineMock.mockReset().mockResolvedValue(undefined);
  deleteDriftEventsMock.mockReset().mockResolvedValue(false);
  requireRoleMock.mockReset().mockResolvedValue({ ok: true });
  requireSaasStepUpMutationMock.mockReset().mockResolvedValue({
    ok: true,
    ctx: { tenant: { id: "tenant-x" }, userId: "user-x" },
  });
  isClerkAuthEnabledMock.mockReset().mockReturnValue(false);
  appendAuditMock.mockReset();
  emitSaasAuditMock.mockReset().mockResolvedValue(undefined);
  revalidateIntegritySurfacesMock.mockReset();
  loadHostsMock.mockReset().mockResolvedValue([]);
  withTenantRlsMock.mockReset().mockResolvedValue([]);
});

async function callDelete(id: string): Promise<Response> {
  const { DELETE } = await import("@/app/api/v1/hosts/[id]/route");
  return DELETE(new Request(`http://test/api/v1/hosts/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe("DELETE /api/v1/hosts/:id", () => {
  it("rejects garbage host ids (path schema)", async () => {
    const res = await callDelete("not a valid id with spaces");
    expect(res.status).toBe(400);
    expect(deleteBaselineMock).not.toHaveBeenCalled();
  });

  it("returns 404 when nothing was actually removed (host already gone)", async () => {
    deleteBaselineMock.mockResolvedValueOnce(false);
    deleteDriftEventsMock.mockResolvedValueOnce(false);

    const res = await callDelete("host-1-2-3-4");

    expect(res.status).toBe(404);
    expect(deleteBaselineMock).toHaveBeenCalledWith("host-1-2-3-4");
    expect(deleteDriftEventsMock).toHaveBeenCalledWith("host-1-2-3-4");
    // No audit on a no-op delete.
    expect(appendAuditMock).not.toHaveBeenCalled();
    expect(revalidateIntegritySurfacesMock).not.toHaveBeenCalled();
  });

  it("returns 204 + cascades when baseline existed", async () => {
    getBaselineMock.mockResolvedValueOnce({ hostname: "demo-host.example.com" });
    deleteBaselineMock.mockResolvedValueOnce(true);
    deleteDriftEventsMock.mockResolvedValueOnce(true);

    const res = await callDelete("host-167-99-59-55");

    expect(res.status).toBe(204);
    expect(deleteBaselineMock).toHaveBeenCalledWith("host-167-99-59-55");
    expect(deleteDriftEventsMock).toHaveBeenCalledWith("host-167-99-59-55");
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    const auditCall = (appendAuditMock.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(auditCall).toMatchObject({
      action: "host.deleted",
      detail: expect.stringContaining("host-167-99-59-55") as unknown,
    });
    expect(revalidateIntegritySurfacesMock).toHaveBeenCalledTimes(1);
    // Legacy path → SaaS audit not emitted.
    expect(emitSaasAuditMock).not.toHaveBeenCalled();
    // Legacy path → no tenant DB cleanup.
    expect(withTenantRlsMock).not.toHaveBeenCalled();
  });

  it("returns 204 even when only drift events existed (no baseline)", async () => {
    deleteBaselineMock.mockResolvedValueOnce(false);
    deleteDriftEventsMock.mockResolvedValueOnce(true);

    const res = await callDelete("host-orphan-drift");

    expect(res.status).toBe(204);
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    expect(revalidateIntegritySurfacesMock).toHaveBeenCalledTimes(1);
  });

  it("returns 502 when baseline delete throws (drift not even attempted)", async () => {
    deleteBaselineMock.mockRejectedValueOnce(new Error("Spaces unavailable"));

    const res = await callDelete("host-1-2-3-4");

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("baseline_delete_failed");
    expect(deleteDriftEventsMock).not.toHaveBeenCalled();
    expect(appendAuditMock).not.toHaveBeenCalled();
  });

  it("still succeeds when drift delete fails (best-effort)", async () => {
    deleteBaselineMock.mockResolvedValueOnce(true);
    deleteDriftEventsMock.mockRejectedValueOnce(new Error("pg pool dead"));

    const res = await callDelete("host-1-2-3-4");

    expect(res.status).toBe(204);
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
  });

  it("denies when the legacy admin role gate fails", async () => {
    requireRoleMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(null, { status: 401 }),
    });

    const res = await callDelete("host-1-2-3-4");

    expect(res.status).toBe(401);
    expect(deleteBaselineMock).not.toHaveBeenCalled();
  });

  it("uses SaaS step-up gate + cleans up collector_hosts row when Clerk is enabled", async () => {
    isClerkAuthEnabledMock.mockReturnValue(true);
    getBaselineMock.mockResolvedValueOnce({ hostname: "demo-host.example.com" });
    deleteBaselineMock.mockResolvedValueOnce(true);
    deleteDriftEventsMock.mockResolvedValueOnce(true);
    withTenantRlsMock.mockResolvedValueOnce([{ id: "ch-uuid-1" }]);

    const res = await callDelete("host-1-2-3-4");

    expect(res.status).toBe(204);
    expect(requireSaasStepUpMutationMock).toHaveBeenCalledTimes(1);
    expect(requireRoleMock).not.toHaveBeenCalled();
    expect(withTenantRlsMock).toHaveBeenCalledTimes(1);
    expect(emitSaasAuditMock).toHaveBeenCalledTimes(1);
    const saasCall = (emitSaasAuditMock.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(saasCall).toMatchObject({
      tenantId: "tenant-x",
      actorUserId: "user-x",
      action: "host.deleted",
      targetType: "host",
      targetId: "host-1-2-3-4",
    });
  });
});
