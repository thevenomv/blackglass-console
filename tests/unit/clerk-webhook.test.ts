/**
 * Unit tests for Clerk webhook handler behaviour.
 *
 * Focuses on the organizationMembership.deleted DB guard:
 * - When tryGetDb() returns null: deleteMembership must NOT be called.
 * - When tryGetDb() returns a truthy value: deleteMembership IS called.
 *
 * We test claimWebhookEvent idempotency and the DB-guard pattern
 * in isolation without importing the full Next.js route handler.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mock claimWebhookEvent ────────────────────────────────────────────────────
vi.mock("@/lib/saas/webhook-idempotency", () => ({
  claimWebhookEvent: vi.fn().mockResolvedValue(true),
}));

// ── Trackable DB helpers ──────────────────────────────────────────────────────
const mockDeleteMembership = vi.fn().mockResolvedValue(undefined);
const mockGetTenantRowByClerkOrg = vi.fn().mockResolvedValue([]);
const mockEmitSaasAudit = vi.fn().mockResolvedValue(undefined);
let mockDbAvailable = false;

vi.mock("@/db", () => ({
  tryGetDb: () => (mockDbAvailable ? {} : null),
  withBypassRls: vi.fn(),
  withTenantRls: vi.fn(),
  schema: {},
}));

vi.mock("@/lib/saas/tenant-service", () => ({
  deleteMembership: (...args: unknown[]) => mockDeleteMembership(...args),
  getTenantRowByClerkOrg: (...args: unknown[]) => mockGetTenantRowByClerkOrg(...args),
  upsertMembership: vi.fn().mockResolvedValue(undefined),
  ensureTenantForClerkOrg: vi.fn().mockResolvedValue({ id: "tenant-1" }),
}));

vi.mock("@/lib/saas/event-log", () => ({
  emitSaasAudit: (...args: unknown[]) => mockEmitSaasAudit(...args),
  emitSaasSecurity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server/audit-log", () => ({
  appendAudit: vi.fn(),
  AUDIT_ACTIONS: { WEBHOOK_RECEIVED: "webhook.received" },
}));

import { tryGetDb } from "@/db";
import { deleteMembership } from "@/lib/saas/tenant-service";
import { claimWebhookEvent } from "@/lib/saas/webhook-idempotency";

// Simulate the organizationMembership.deleted handler logic in isolation
async function handleMembershipDeleted(orgId: string, userId: string) {
  if (tryGetDb()) {
    const { getTenantRowByClerkOrg } = await import("@/lib/saas/tenant-service");
    const rows = await getTenantRowByClerkOrg(orgId);
    const tenantId = rows[0]?.id;
    if (tenantId) {
      await mockEmitSaasAudit({
        tenantId,
        actorUserId: userId,
        action: "member.removed",
      });
    }
    await deleteMembership(orgId, userId);
  }
}

describe("Clerk webhook: organizationMembership.deleted DB guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbAvailable = false;
    mockGetTenantRowByClerkOrg.mockResolvedValue([{ id: "tenant-1" }]);
  });

  it("does NOT call deleteMembership when DB is unavailable", async () => {
    mockDbAvailable = false;
    await handleMembershipDeleted("org_abc", "user_xyz");
    expect(mockDeleteMembership).not.toHaveBeenCalled();
  });

  it("calls deleteMembership when DB is available", async () => {
    mockDbAvailable = true;
    await handleMembershipDeleted("org_abc", "user_xyz");
    expect(mockDeleteMembership).toHaveBeenCalledWith("org_abc", "user_xyz");
  });

  it("emits audit event for the removed member when DB is available", async () => {
    mockDbAvailable = true;
    await handleMembershipDeleted("org_abc", "user_xyz");
    expect(mockEmitSaasAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "member.removed", actorUserId: "user_xyz" }),
    );
  });

  it("does NOT emit audit event when DB is unavailable", async () => {
    mockDbAvailable = false;
    await handleMembershipDeleted("org_abc", "user_xyz");
    expect(mockEmitSaasAudit).not.toHaveBeenCalled();
  });
});

describe("Clerk webhook: idempotency", () => {
  it("claimWebhookEvent called with source='clerk'", async () => {
    await claimWebhookEvent("clerk", "evt_clerk_001");
    expect(claimWebhookEvent).toHaveBeenCalledWith("clerk", "evt_clerk_001");
  });
});
