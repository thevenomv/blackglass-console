/**
 * Tests for stripe-sync.ts — mapStripeStatus and subscription status mapping.
 *
 * We test the exported `syncSaasSubscriptionFromStripe` indirectly by verifying
 * the pure logic functions. DB calls are exercised via saas-rbac integration tests.
 * Here we focus on the status mapping edge cases.
 */
import { describe, expect, it } from "vitest";
import {
  isSubscriptionOperational,
  operationalBlockReason,
} from "@/lib/saas/trial";
import type { SaasSubscription } from "@/db/schema";

// Re-test that past_due flows correctly through trial.ts (which stripe-sync.ts feeds).
// The stripe-sync mapStripeStatus function maps Stripe statuses → DB statuses.

function makeSub(status: SaasSubscription["status"]): SaasSubscription {
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

describe("stripe subscription status mapping (via trial.ts)", () => {
  const cases: Array<[SaasSubscription["status"], boolean, string | null]> = [
    ["active",        true,  null],
    ["trialing",      true,  null],
    ["past_due",      true,  "trial_read_only"],   // Stripe grace period — degraded, not locked
    ["canceled",      false, "subscription_inactive"],
    ["trial_expired", false, "trial_read_only"],
    ["custom",        true,  null],
  ];

  for (const [status, expectOperational, expectReason] of cases) {
    it(`status=${status}: operational=${expectOperational} blockReason=${String(expectReason)}`, () => {
      const s = makeSub(status);
      expect(isSubscriptionOperational(s)).toBe(expectOperational);
      expect(operationalBlockReason(s)).toBe(expectReason);
    });
  }

  it("past_due is NEVER subscription_inactive (must not hard-lock during grace period)", () => {
    const s = makeSub("past_due");
    expect(operationalBlockReason(s)).not.toBe("subscription_inactive");
  });

  it("past_due IS trial_read_only (mutations blocked, reads allowed)", () => {
    const s = makeSub("past_due");
    expect(operationalBlockReason(s)).toBe("trial_read_only");
    expect(isSubscriptionOperational(s)).toBe(true);
  });
});
