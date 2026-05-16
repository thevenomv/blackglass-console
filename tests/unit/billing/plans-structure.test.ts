/**
 * Pin the commercial plan ladder.
 *
 * The pricing structure encodes business decisions that cross-cut every
 * permission check, retention enforcement and Stripe code path. A typo
 * in `hostLimit` or a forgotten retention sentinel is invisible at
 * runtime but materially wrong — these tests make those changes
 * impossible to ship without explicit acknowledgement.
 */
import { describe, expect, it } from "vitest";

import {
  ADD_ONS,
  COMMERCIAL_PLANS,
  ENTERPRISE_PRICE_ANCHOR_CENTS_MONTHLY,
  PLAN_PRICING,
  STRIPE_PRICE_ENV_VARS,
  TRIAL_DAYS,
  TRIAL_HOST_LIMIT,
  TRIAL_PAID_SEAT_LIMIT,
  getPlanDefinition,
  maxRetentionDays,
  maxScansPerDayPerHost,
  planSatisfiesApiAccess,
  remediatorAvailable,
  remediatorIsAddon,
  retentionWithinPlan,
  type CommercialPlanCode,
} from "@/lib/saas/plans";

const PAID_LADDER = ["lab", "starter", "team", "growth", "scale", "business"] as const;

describe("commercial plan ladder", () => {
  it("declares every paid tier with a definition", () => {
    for (const code of PAID_LADDER) {
      expect(COMMERCIAL_PLANS[code]).toBeDefined();
      expect(COMMERCIAL_PLANS[code].code).toBe(code);
    }
  });

  it("hostLimit increases monotonically up the ladder", () => {
    const limits = PAID_LADDER.map((c) => COMMERCIAL_PLANS[c].hostLimit);
    expect(limits).toEqual([5, 15, 25, 100, 200, 300]);
    for (let i = 1; i < limits.length; i++) {
      expect(limits[i]!).toBeGreaterThan(limits[i - 1]!);
    }
  });

  it("paidSeatLimit never decreases up the ladder (Starter/Team intentionally tie at 3)", () => {
    const seats = PAID_LADDER.map((c) => COMMERCIAL_PLANS[c].paidSeatLimit);
    for (let i = 1; i < seats.length; i++) {
      expect(seats[i]!).toBeGreaterThanOrEqual(seats[i - 1]!);
    }
    expect(seats).toEqual([1, 3, 3, 5, 7, 10]);
  });

  it("retention caps never decrease as you go up the ladder", () => {
    const dims = ["drift", "audit", "baseline", "evidence"] as const;
    for (const dim of dims) {
      const caps = PAID_LADDER.map((c) => maxRetentionDays(c, dim));
      for (let i = 1; i < caps.length; i++) {
        // -1 represents "unlimited" and must compare as the highest.
        const previous = caps[i - 1] === -1 ? Number.POSITIVE_INFINITY : caps[i - 1]!;
        const current = caps[i] === -1 ? Number.POSITIVE_INFINITY : caps[i]!;
        expect(current).toBeGreaterThanOrEqual(previous);
      }
    }
  });

  it("scan frequency increases (or holds) up the ladder", () => {
    const scans = PAID_LADDER.map((c) => maxScansPerDayPerHost(c));
    // Team and Growth both hourly (24/day) — Team's value vs Growth is the
    // host count and feature set, not scan cadence.
    expect(scans).toEqual([1, 4, 24, 24, 48, 96]);
    for (let i = 1; i < scans.length; i++) {
      expect(scans[i]!).toBeGreaterThanOrEqual(scans[i - 1]!);
    }
  });

  it("Lab is the only paid-ladder tier without scheduled scans enabled", () => {
    expect(COMMERCIAL_PLANS.lab.scheduledScansEnabled).toBe(false);
    for (const code of ["starter", "team", "growth", "scale", "business"] as const) {
      expect(COMMERCIAL_PLANS[code].scheduledScansEnabled).toBe(true);
    }
  });

  it("Lab and Starter are read-only API; Team and above are full API", () => {
    expect(COMMERCIAL_PLANS.lab.apiAccess).toBe("read_only");
    expect(COMMERCIAL_PLANS.starter.apiAccess).toBe("read_only");
    for (const code of ["team", "growth", "scale", "business"] as const) {
      expect(COMMERCIAL_PLANS[code].apiAccess).toBe("full");
    }
  });

  it("Lab disables every paid feature flag", () => {
    const lab = COMMERCIAL_PLANS.lab;
    expect(lab.ssoIncluded).toBe(false);
    expect(lab.byokIncluded).toBe(false);
    expect(lab.airgapIncluded).toBe(false);
    expect(lab.remediatorIncluded).toBe(false);
    expect(lab.remediatorAddonAvailable).toBe(false);
    expect(lab.evidenceBundlesPerMonth).toBe(0);
    expect(lab.concurrentSandboxes).toBe(0);
    expect(lab.webhookDeliveriesPerMonth).toBe(0);
  });

  it("Lab still gets 1 free Charon linked account (read-only inventory wedge)", () => {
    // Pricing recommendation P1-4 (2026-05-10): Lab keeps the 1-cloud-account
    // wedge so the public /tools estimator can convert into the real product
    // without an immediate paywall. Live cleanup is still gated by add-on.
    expect(COMMERCIAL_PLANS.lab.charonLinkedAccountsMax).toBe(1);
    expect(COMMERCIAL_PLANS.lab.charonLiveCleanupEnabled).toBe(false);
  });

  it("Business includes Remediator; Growth and Scale only as add-on", () => {
    expect(COMMERCIAL_PLANS.business.remediatorIncluded).toBe(true);
    expect(COMMERCIAL_PLANS.business.remediatorAddonAvailable).toBe(false);
    for (const code of ["growth", "scale"] as const) {
      expect(COMMERCIAL_PLANS[code].remediatorIncluded).toBe(false);
      expect(COMMERCIAL_PLANS[code].remediatorAddonAvailable).toBe(true);
    }
    for (const code of ["lab", "starter", "team"] as const) {
      expect(COMMERCIAL_PLANS[code].remediatorIncluded).toBe(false);
      expect(COMMERCIAL_PLANS[code].remediatorAddonAvailable).toBe(false);
    }
  });

  it("Team sits between Starter and Growth on every numeric capacity dimension", () => {
    const s = COMMERCIAL_PLANS.starter;
    const t = COMMERCIAL_PLANS.team;
    const g = COMMERCIAL_PLANS.growth;
    expect(t.hostLimit).toBeGreaterThan(s.hostLimit);
    expect(t.hostLimit).toBeLessThan(g.hostLimit);
    expect(t.evidenceBundlesPerMonth).toBeGreaterThan(s.evidenceBundlesPerMonth);
    expect(t.evidenceBundlesPerMonth).toBeLessThan(g.evidenceBundlesPerMonth);
    expect(t.webhookDeliveriesPerMonth).toBeGreaterThan(s.webhookDeliveriesPerMonth);
    expect(t.webhookDeliveriesPerMonth).toBeLessThan(g.webhookDeliveriesPerMonth);
  });
});

describe("pricing", () => {
  it("publishes monthly base prices for every paid tier except Lab", () => {
    const tiers = ["starter", "team", "growth", "scale", "business"] as const;
    for (const code of tiers) {
      const price = PLAN_PRICING[code];
      expect(price).toBeDefined();
      expect(price.baseCentsMonthly).toBeGreaterThan(0);
      // Annual is exactly 10× monthly — "two months free" promise.
      expect(price.baseCentsAnnual).toBe(price.baseCentsMonthly * 10);
    }
  });

  it("Starter / Team / Growth headline prices match the published cards", () => {
    expect(PLAN_PRICING.starter.baseCentsMonthly).toBe(5_900);
    expect(PLAN_PRICING.team.baseCentsMonthly).toBe(8_900);
    expect(PLAN_PRICING.growth.baseCentsMonthly).toBe(19_900);
  });

  it("per-host overage gets cheaper as you go up the ladder", () => {
    const tiers = ["starter", "team", "growth", "scale", "business"] as const;
    const overages = tiers.map((c) => PLAN_PRICING[c].extraHostCentsMonthly);
    expect(overages).toEqual([400, 300, 200, 150, 100]);
    for (let i = 1; i < overages.length; i++) {
      expect(overages[i]!).toBeLessThanOrEqual(overages[i - 1]!);
    }
  });

  it("per-seat overage gets more expensive as roles get more privileged", () => {
    const tiers = ["starter", "team", "growth", "scale", "business"] as const;
    const seats = tiers.map((c) => PLAN_PRICING[c].extraSeatCentsMonthly);
    for (let i = 1; i < seats.length; i++) {
      expect(seats[i]!).toBeGreaterThanOrEqual(seats[i - 1]!);
    }
  });

  it("Enterprise anchor is published and meaningful", () => {
    // Bumped 2026-05-10 from $1,500 to $2,500 so the floor can fund
    // named-CSM and SLA promises that ship with the tier.
    expect(ENTERPRISE_PRICE_ANCHOR_CENTS_MONTHLY).toBe(250_000);
  });

  it("trial constants are wired correctly", () => {
    expect(TRIAL_HOST_LIMIT).toBe(10);
    expect(TRIAL_PAID_SEAT_LIMIT).toBe(2);
    expect(TRIAL_DAYS).toBe(14);
  });
});

describe("getPlanDefinition", () => {
  it("returns null for unknown plan codes", () => {
    expect(getPlanDefinition("startre")).toBeNull();
    expect(getPlanDefinition("")).toBeNull();
    expect(getPlanDefinition("free")).toBeNull(); // legacy code from src/lib/plan.ts
  });

  it("returns Enterprise definition with -1 sentinels and every premium feature", () => {
    const ent = getPlanDefinition("enterprise");
    expect(ent).not.toBeNull();
    expect(ent!.hostLimit).toBe(-1);
    expect(ent!.paidSeatLimit).toBe(-1);
    expect(ent!.ssoIncluded).toBe(true);
    expect(ent!.byokIncluded).toBe(true);
    expect(ent!.airgapIncluded).toBe(true);
    expect(ent!.remediatorIncluded).toBe(true);
    expect(ent!.immutableAuditLog).toBe(true);
    expect(ent!.supportSla).toBe(true);
  });

  it("Enterprise audit retention caps at 7 years (SOX/PCI residency)", () => {
    expect(getPlanDefinition("enterprise")!.retentionAuditDaysMax).toBe(2_555);
  });

  it("trial inherits the Starter feature set with trial host/seat caps", () => {
    const trial = getPlanDefinition("trial");
    expect(trial).not.toBeNull();
    expect(trial!.hostLimit).toBe(TRIAL_HOST_LIMIT);
    expect(trial!.paidSeatLimit).toBe(TRIAL_PAID_SEAT_LIMIT);
    expect(trial!.scheduledScansEnabled).toBe(true);
    expect(trial!.apiAccess).toBe("read_only");
  });
});

describe("retentionWithinPlan", () => {
  it("accepts requests at or below the plan cap", () => {
    expect(retentionWithinPlan("starter", "drift", 30)).toBe(true);
    expect(retentionWithinPlan("starter", "drift", 7)).toBe(true);
    expect(retentionWithinPlan("growth", "audit", 365)).toBe(true);
  });

  it("rejects requests above the plan cap", () => {
    expect(retentionWithinPlan("starter", "drift", 90)).toBe(false);
    expect(retentionWithinPlan("starter", "audit", 730)).toBe(false);
  });

  it("treats null and 0 as 'platform default' and always accepts them", () => {
    expect(retentionWithinPlan("lab", "drift", null)).toBe(true);
    expect(retentionWithinPlan("lab", "audit", 0)).toBe(true);
  });

  it("Enterprise drift retention is unlimited", () => {
    expect(retentionWithinPlan("enterprise", "drift", 100_000)).toBe(true);
  });

  it("unknown plan codes reject every retention request", () => {
    expect(retentionWithinPlan("nonsense", "drift", 30)).toBe(false);
  });
});

describe("planSatisfiesApiAccess", () => {
  it("read_only is satisfied by every tier", () => {
    for (const code of ["lab", "starter", "team", "growth", "scale", "business", "enterprise"] as const) {
      expect(planSatisfiesApiAccess(code, "read_only")).toBe(true);
    }
  });

  it("full is denied to Lab and Starter, granted to Team+", () => {
    expect(planSatisfiesApiAccess("lab", "full")).toBe(false);
    expect(planSatisfiesApiAccess("starter", "full")).toBe(false);
    for (const code of ["team", "growth", "scale", "business", "enterprise"] as const) {
      expect(planSatisfiesApiAccess(code, "full")).toBe(true);
    }
  });

  it("returns false for unknown plan codes regardless of required level", () => {
    expect(planSatisfiesApiAccess("nonsense", "read_only")).toBe(false);
    expect(planSatisfiesApiAccess("nonsense", "full")).toBe(false);
  });
});

describe("remediator helpers", () => {
  it("remediator unavailable on Lab, Starter, and Team", () => {
    expect(remediatorAvailable("lab")).toBe(false);
    expect(remediatorAvailable("starter")).toBe(false);
    expect(remediatorAvailable("team")).toBe(false);
  });

  it("remediator available as add-on on Growth and Scale", () => {
    expect(remediatorAvailable("growth")).toBe(true);
    expect(remediatorAvailable("scale")).toBe(true);
    expect(remediatorIsAddon("growth")).toBe(true);
    expect(remediatorIsAddon("scale")).toBe(true);
  });

  it("remediator included on Business and Enterprise (not an add-on)", () => {
    expect(remediatorAvailable("business")).toBe(true);
    expect(remediatorAvailable("enterprise")).toBe(true);
    expect(remediatorIsAddon("business")).toBe(false);
    expect(remediatorIsAddon("enterprise")).toBe(false);
  });
});

describe("add-ons catalogue", () => {
  it("Remediator add-on uses the same 10× annual rule as base plans", () => {
    const r = ADD_ONS.remediator;
    expect(r.baseCentsAnnual).toBe(r.baseCentsMonthly * 10);
    expect(r.baseCentsMonthly).toBe(9_900);
  });

  it("Remediator add-on includes 250 actions/month with $0.10 overage", () => {
    // Bumped 2026-05-10 from 100 → 250 so a real Growth customer running
    // weekly drift on a 10-host fleet doesn't blow through the included
    // pool in week 1 and immediately see metered overage.
    expect(ADD_ONS.remediator.includedActionsPerMonth).toBe(250);
    expect(ADD_ONS.remediator.extraActionCents).toBe(10);
  });

  it("Charon add-on follows the same 10× annual rule and $49/mo anchor", () => {
    const c = ADD_ONS.charon;
    expect(c.baseCentsAnnual).toBe(c.baseCentsMonthly * 10);
    expect(c.baseCentsMonthly).toBe(4_900);
  });
});

describe("Stripe price-id mapping", () => {
  it("declares env-var slots for every paid tier", () => {
    const expected: Array<Exclude<CommercialPlanCode, "trial" | "enterprise" | "lab">> = [
      "starter",
      "team",
      "growth",
      "scale",
      "business",
    ];
    for (const code of expected) {
      const slot = STRIPE_PRICE_ENV_VARS[code];
      expect(slot).toBeDefined();
      expect(slot.monthly).toMatch(/^STRIPE_/);
      expect(slot.annual).toMatch(/^STRIPE_/);
    }
  });

  it("Team uses the STRIPE_TEAM_PRICE_ID env-var slot", () => {
    expect(STRIPE_PRICE_ENV_VARS.team).toEqual({
      monthly: "STRIPE_TEAM_PRICE_ID",
      annual: "STRIPE_TEAM_ANNUAL_PRICE_ID",
    });
  });

  it("Lab is intentionally absent — it has no Stripe SKU", () => {
    expect("lab" in STRIPE_PRICE_ENV_VARS).toBe(false);
  });
});
