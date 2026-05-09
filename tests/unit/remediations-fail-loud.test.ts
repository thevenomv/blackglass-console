/**
 * Tests for /api/v1/remediations/[id]/[action] — operator approve / reject.
 *
 * Remediation is a binary action: it either triggered the sidecar or it
 * didn't. The previous behaviour returned 200 even when the
 * remediator was unreachable or rejected the decision, leaving the
 * operator believing a fix was in flight when nothing happened.
 *
 * These tests pin the new contract:
 *   • sidecar accepts → 200, audited, notified=true
 *   • sidecar 5xx     → 502 remediator_upstream_error
 *   • sidecar timeout → 502 remediator_unreachable
 *   • no sidecar URL  → 200, notified=false (intentional opt-out)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const setRemediationStatusMock = vi.hoisted(() =>
  vi.fn(async () => ({ id: "rem_1", status: "approved" })),
);
const checkScanPostRateMock = vi.hoisted(() => vi.fn(async () => true));
const requireSaasOrLegacyPermissionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    mode: "saas",
    ctx: { tenant: { id: "tenant_1" }, userId: "user_1" },
  })),
);
const emitSaasAuditMock = vi.hoisted(() => vi.fn());
const approvalTokensConfiguredMock = vi.hoisted(() => vi.fn(() => false));
const signApprovalTokenMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/services/remediation-service", () => ({
  setRemediationStatus: setRemediationStatusMock,
}));
vi.mock("@/lib/server/rate-limit", () => ({
  checkScanPostRate: checkScanPostRateMock,
  clientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/server/http/saas-access", () => ({
  requireSaasOrLegacyPermission: requireSaasOrLegacyPermissionMock,
}));
vi.mock("@/lib/saas/event-log", () => ({
  emitSaasAudit: emitSaasAuditMock,
}));
vi.mock("@/lib/server/remediator/approval-token", () => ({
  approvalTokensConfigured: approvalTokensConfiguredMock,
  signApprovalToken: signApprovalTokenMock,
}));

beforeEach(() => {
  setRemediationStatusMock
    .mockReset()
    .mockResolvedValue({ id: "rem_1", status: "approved" });
  checkScanPostRateMock.mockReset().mockResolvedValue(true);
  emitSaasAuditMock.mockReset();
  approvalTokensConfiguredMock.mockReset().mockReturnValue(false);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.BLACKGLASS_REMEDIATOR_BASE_URL = "https://remediator.example/";
});

async function call(action: "approve" | "reject"): Promise<Response> {
  const { POST } = await import(
    "../../src/app/api/v1/remediations/[id]/[action]/route"
  );
  const url = `https://example.com/api/v1/remediations/rem_1/${action}`;
  return POST(new Request(url, { method: "POST" }), {
    params: Promise.resolve({ id: "rem_1", action }),
  });
}

describe("POST /api/v1/remediations/[id]/[action]", () => {
  it("returns 200 + notified=true when the sidecar accepts", async () => {
    fetchMock.mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const res = await call("approve");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; notified: boolean };
    expect(body.ok).toBe(true);
    expect(body.notified).toBe(true);
  });

  it("returns 502 remediator_upstream_error when the sidecar 5xx's", async () => {
    fetchMock.mockResolvedValue(
      new Response("internal error", { status: 503 }),
    );

    const res = await call("approve");
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("remediator_upstream_error");
    expect(body.detail).toMatch(/remediator service rejected/i);
  });

  it("returns 502 remediator_unreachable on transport error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await call("reject");
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("remediator_unreachable");
    expect(body.detail).toMatch(/unreachable/i);
  });

  it("returns 200 + notified=false when no remediator is configured", async () => {
    delete process.env.BLACKGLASS_REMEDIATOR_BASE_URL;

    const res = await call("approve");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; notified: boolean };
    expect(body.ok).toBe(true);
    expect(body.notified).toBe(false);
    // Sidecar URL absent → fetch should never have been called.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
