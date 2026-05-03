import { describe, expect, it } from "vitest";
import { soleOwnerDemotionBlocked } from "@/lib/saas/member-guards";
import { isSubscriptionOperational, operationalBlockReason } from "@/lib/saas/trial";
import type { SaasSubscription } from "@/db/schema";

function sub(status: SaasSubscription["status"]): SaasSubscription {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    tenantId: "00000000-0000-0000-0000-000000000002",
    planCode: "growth",
    status,
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    hostLimit: 100,
    paidSeatLimit: 8,
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    features: {},
    updatedAt: new Date(),
  };
}

describe("member guards", () => {
  it("blocks demoting the only owner", () => {
    const m = [
      { userId: "a", role: "owner" as const, status: "active" },
      { userId: "b", role: "viewer" as const, status: "active" },
    ];
    expect(soleOwnerDemotionBlocked(m, "a", "viewer")).toBe(true);
  });

  it("allows demoting one owner when another exists", () => {
    const m = [
      { userId: "a", role: "owner" as const, status: "active" },
      { userId: "b", role: "owner" as const, status: "active" },
    ];
    expect(soleOwnerDemotionBlocked(m, "a", "viewer")).toBe(false);
  });
});

describe("subscription operational state for member management decisions", () => {
  it("active: operational=true, blockReason=null", () => {
    const s = sub("active");
    expect(isSubscriptionOperational(s)).toBe(true);
    expect(operationalBlockReason(s)).toBeNull();
  });

  it("past_due: operational=true (grace period), blockReason=trial_read_only (mutations blocked)", () => {
    const s = sub("past_due");
    expect(isSubscriptionOperational(s)).toBe(true);
    expect(operationalBlockReason(s)).toBe("trial_read_only");
  });

  it("canceled: operational=false, blockReason=subscription_inactive", () => {
    const s = sub("canceled");
    expect(isSubscriptionOperational(s)).toBe(false);
    expect(operationalBlockReason(s)).toBe("subscription_inactive");
  });

  it("past_due never returns subscription_inactive (would hard-lock during Stripe grace period)", () => {
    const s = sub("past_due");
    expect(operationalBlockReason(s)).not.toBe("subscription_inactive");
  });
});
