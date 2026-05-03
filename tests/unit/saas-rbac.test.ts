import { describe, expect, it } from "vitest";
import { canAssignRole, hasPermission } from "@/lib/saas/permissions";
import { canAddPaidSeat, countPaidSeats, getSeatUsage, canApplyRoleChange } from "@/lib/saas/seats";
import { canRunScansForTenant, canModifyBaselinesForTenant, canRotateSecretsForTenant } from "@/lib/saas/operations";
import type { SaasSubscription } from "@/db/schema";

function sub(over: Partial<SaasSubscription> = {}): SaasSubscription {
  const base: SaasSubscription = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    tenantId: "550e8400-e29b-41d4-a716-446655440001",
    planCode: "trial",
    status: "trialing",
    trialEndsAt: new Date(Date.now() + 86400000),
    currentPeriodEndsAt: null,
    hostLimit: 10,
    paidSeatLimit: 2,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    features: {},
    updatedAt: new Date(),
  };
  return { ...base, ...over };
}

describe("saas RBAC", () => {
  it("admin cannot assign owner", () => {
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("admin", "operator")).toBe(true);
  });

  it("owner can assign any role", () => {
    expect(canAssignRole("owner", "owner")).toBe(true);
  });

  it("viewer cannot run scans", () => {
    expect(hasPermission("viewer", "scans.run")).toBe(false);
  });

  it("operator can run scans when subscription active", () => {
    const s = sub({
      status: "active",
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      hostLimit: 25,
      paidSeatLimit: 3,
      features: {},
      updatedAt: new Date(),
    });
    expect(canRunScansForTenant("operator", s).ok).toBe(true);
  });

  it("blocks scans after trial read-only", () => {
    const past = new Date(Date.now() - 86400000);
    const s = sub({
      status: "trial_expired",
      trialEndsAt: past,
      currentPeriodEndsAt: null,
      hostLimit: 10,
      paidSeatLimit: 2,
      features: {},
      updatedAt: new Date(),
    });
    const r = canRunScansForTenant("operator", s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("trial_read_only");
  });

  it("allows viewer invites when paid seats exhausted", () => {
    const memberships = [
      { role: "owner" as const, status: "active" },
      { role: "operator" as const, status: "active" },
      { role: "operator" as const, status: "active" },
    ];
    expect(countPaidSeats(memberships)).toBe(3);
    expect(canAddPaidSeat(memberships, 3, "viewer").ok).toBe(true);
  });

  it("blocks paid role when at cap", () => {
    const memberships = [
      { role: "owner" as const, status: "active" },
      { role: "operator" as const, status: "active" },
    ];
    expect(canAddPaidSeat(memberships, 2, "admin").ok).toBe(false);
  });

  it("enterprise unlimited seats when limit negative", () => {
    const memberships = [{ role: "owner" as const, status: "active" }];
    expect(canAddPaidSeat(memberships, -1, "admin").ok).toBe(true);
  });

  it("paid→paid role change does not consume an extra seat", () => {
    const memberships = [
      { userId: "u1", role: "owner" as const, status: "active" },
      { userId: "u2", role: "operator" as const, status: "active" },
    ];
    expect(canApplyRoleChange(memberships, "u2", "admin", 2).ok).toBe(true);
  });

  it("viewer→operator blocked when at paid seat cap", () => {
    const memberships = [
      { userId: "u1", role: "owner" as const, status: "active" },
      { userId: "u2", role: "operator" as const, status: "active" },
      { userId: "u3", role: "viewer" as const, status: "active" },
    ];
    expect(canApplyRoleChange(memberships, "u3", "operator", 2).ok).toBe(false);
  });

  it("past_due: canRunScansForTenant returns trial_read_only (Stripe grace period — not subscription_inactive)", () => {
    const s = sub({
      status: "past_due",
      planCode: "growth",
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      hostLimit: 100,
      paidSeatLimit: 8,
      features: {},
      updatedAt: new Date(),
    });
    const r = canRunScansForTenant("operator", s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("trial_read_only");
      expect(r.code).not.toBe("subscription_inactive");
    }
  });

  it("past_due: canModifyBaselinesForTenant returns trial_read_only", () => {
    const s = sub({
      status: "past_due",
      planCode: "growth",
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      hostLimit: 100,
      paidSeatLimit: 8,
      features: {},
      updatedAt: new Date(),
    });
    const r = canModifyBaselinesForTenant("operator", s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("trial_read_only");
  });

  it("past_due: canRotateSecretsForTenant returns trial_read_only", () => {
    const s = sub({
      status: "past_due",
      planCode: "growth",
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      hostLimit: 100,
      paidSeatLimit: 8,
      features: {},
      updatedAt: new Date(),
    });
    const r = canRotateSecretsForTenant("admin", s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("trial_read_only");
  });
});
