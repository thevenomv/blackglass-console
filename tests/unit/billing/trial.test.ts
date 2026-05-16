import { describe, expect, it } from "vitest";
import {
  isTrialReadOnlyState,
  isSubscriptionOperational,
  operationalBlockReason,
} from "@/lib/saas/trial";
import type { SaasSubscription } from "@/db/schema";

const NOW = new Date("2026-05-03T12:00:00Z");
const FUTURE = new Date(NOW.getTime() + 86400000);
const PAST = new Date(NOW.getTime() - 86400000);

function sub(over: Partial<SaasSubscription>): SaasSubscription {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    tenantId: "00000000-0000-0000-0000-000000000002",
    planCode: "trial",
    status: "trialing",
    trialEndsAt: FUTURE,
    currentPeriodEndsAt: null,
    hostLimit: 10,
    paidSeatLimit: 2,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    features: {},
    updatedAt: NOW,
    ...over,
  };
}

describe("isTrialReadOnlyState", () => {
  it("false for trialing with future end date", () => {
    expect(isTrialReadOnlyState(sub({ status: "trialing", trialEndsAt: FUTURE }), NOW)).toBe(false);
  });

  it("true for trialing with past end date", () => {
    expect(isTrialReadOnlyState(sub({ status: "trialing", trialEndsAt: PAST }), NOW)).toBe(true);
  });

  it("true for trial_expired", () => {
    expect(isTrialReadOnlyState(sub({ status: "trial_expired" }), NOW)).toBe(true);
  });

  it("false for active", () => {
    expect(isTrialReadOnlyState(sub({ status: "active", trialEndsAt: null }), NOW)).toBe(false);
  });

  it("false for past_due", () => {
    expect(isTrialReadOnlyState(sub({ status: "past_due", trialEndsAt: null }), NOW)).toBe(false);
  });
});

describe("isSubscriptionOperational", () => {
  it("true for trialing within trial period", () => {
    expect(isSubscriptionOperational(sub({ status: "trialing", trialEndsAt: FUTURE }), NOW)).toBe(true);
  });

  it("false for trialing past trial end", () => {
    expect(isSubscriptionOperational(sub({ status: "trialing", trialEndsAt: PAST }), NOW)).toBe(false);
  });

  it("true for active", () => {
    expect(isSubscriptionOperational(sub({ status: "active", trialEndsAt: null }), NOW)).toBe(true);
  });

  it("true for past_due — degraded but not hard-locked (Stripe grace period)", () => {
    expect(isSubscriptionOperational(sub({ status: "past_due", trialEndsAt: null }), NOW)).toBe(true);
  });

  it("false for canceled", () => {
    expect(isSubscriptionOperational(sub({ status: "canceled", trialEndsAt: null }), NOW)).toBe(false);
  });

  it("false for trial_expired", () => {
    expect(isSubscriptionOperational(sub({ status: "trial_expired" }), NOW)).toBe(false);
  });

  it("true for custom (enterprise)", () => {
    expect(isSubscriptionOperational(sub({ status: "custom", trialEndsAt: null }), NOW)).toBe(true);
  });
});

describe("operationalBlockReason", () => {
  it("null for active", () => {
    expect(operationalBlockReason(sub({ status: "active", trialEndsAt: null }), NOW)).toBeNull();
  });

  it("null for trialing within period", () => {
    expect(operationalBlockReason(sub({ status: "trialing", trialEndsAt: FUTURE }), NOW)).toBeNull();
  });

  it("trial_read_only for trialing past period", () => {
    expect(operationalBlockReason(sub({ status: "trialing", trialEndsAt: PAST }), NOW)).toBe("trial_read_only");
  });

  it("trial_read_only for trial_expired", () => {
    expect(operationalBlockReason(sub({ status: "trial_expired" }), NOW)).toBe("trial_read_only");
  });

  it("trial_read_only for past_due — degrades to read-only, not subscription_inactive", () => {
    expect(operationalBlockReason(sub({ status: "past_due", trialEndsAt: null }), NOW)).toBe("trial_read_only");
  });

  it("subscription_inactive for canceled", () => {
    expect(operationalBlockReason(sub({ status: "canceled", trialEndsAt: null }), NOW)).toBe("subscription_inactive");
  });

  it("null for custom (enterprise)", () => {
    expect(operationalBlockReason(sub({ status: "custom", trialEndsAt: null }), NOW)).toBeNull();
  });
});
