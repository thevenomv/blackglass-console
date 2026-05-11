import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SaasSubscription } from "@/db/schema";
import { applyEnterpriseSubscriptionGrant } from "@/lib/saas/enterprise-grant";

function mockSub(overrides: Partial<SaasSubscription> = {}): SaasSubscription {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    tenantId: "00000000-0000-0000-0000-000000000002",
    planCode: "starter",
    status: "active",
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    hostLimit: 15,
    paidSeatLimit: 3,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    features: {},
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("applyEnterpriseSubscriptionGrant", () => {
  const tenantId = "00000000-0000-0000-0000-000000000002";

  beforeEach(() => {
    vi.stubEnv("BLACKGLASS_ENTERPRISE_GRANT_EMAILS", "");
    vi.stubEnv("BLACKGLASS_ENTERPRISE_GRANT_TENANT_IDS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns unchanged when no grant matches", () => {
    const sub = mockSub();
    expect(applyEnterpriseSubscriptionGrant(sub, tenantId)).toBe(sub);
    expect(applyEnterpriseSubscriptionGrant(sub, tenantId, ["other@x.com"])).toBe(sub);
  });

  it("upgrades via tenant id env list", () => {
    vi.stubEnv("BLACKGLASS_ENTERPRISE_GRANT_TENANT_IDS", `${tenantId},deadbeef-dead-beef-dead-beefdeadbeef`);
    const sub = mockSub({ planCode: "trial", status: "trialing" });
    const next = applyEnterpriseSubscriptionGrant(sub, tenantId);
    expect(next.planCode).toBe("enterprise");
    expect(next.status).toBe("active");
    expect(next.hostLimit).toBe(-1);
    expect(next.paidSeatLimit).toBe(-1);
    expect(next.trialEndsAt).toBeNull();
  });

  it("upgrades via env email list", () => {
    vi.stubEnv("BLACKGLASS_ENTERPRISE_GRANT_EMAILS", "ops@company.com");
    const sub = mockSub();
    const next = applyEnterpriseSubscriptionGrant(sub, tenantId, ["ops@company.com"]);
    expect(next.planCode).toBe("enterprise");
  });

  it("upgrades via built-in founder email (case-insensitive)", () => {
    const sub = mockSub({ planCode: "lab" });
    const next = applyEnterpriseSubscriptionGrant(sub, "some-other-tenant-id", ["JamieSibley5@gmail.com"]);
    expect(next.planCode).toBe("enterprise");
    expect(next.status).toBe("active");
  });
});
