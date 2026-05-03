import type { TenantRole } from "./tenant-role";

export type CommercialPlanCode = "starter" | "growth" | "business" | "enterprise" | "trial";

export type PlanDefinition = {
  code: CommercialPlanCode;
  label: string;
  /** Maximum managed hosts. -1 = unlimited (enterprise). */
  hostLimit: number;
  /**
   * Maximum operator/admin seats (owner + admin + operator roles).
   * Viewers and guest_auditors are always unlimited and never consume seats.
   * -1 = unlimited (enterprise).
   */
  paidSeatLimit: number;
};

/**
 * Pricing knobs — all values in USD cents/month.
 * Keep these in one place so they can be updated without touching UI or API code.
 */
export type PlanPricing = {
  /** Base recurring charge in USD cents/month (e.g. 7900 = $79.00). */
  baseCentsMonthly: number;
  /** Annual billing base (approx 2 months free: baseCentsMonthly * 10). */
  baseCentsAnnual: number;
  /** Per-host overage beyond included quota, in USD cents/month. */
  extraHostCentsMonthly: number;
  /** Per operator/admin seat overage beyond included quota, in USD cents/month. */
  extraSeatCentsMonthly: number;
};

export const PLAN_PRICING: Record<Exclude<CommercialPlanCode, "trial" | "enterprise">, PlanPricing> = {
  starter:  { baseCentsMonthly: 7_900,  baseCentsAnnual: 79_000,  extraHostCentsMonthly: 200,   extraSeatCentsMonthly: 1_500 },
  growth:   { baseCentsMonthly: 19_900, baseCentsAnnual: 199_000, extraHostCentsMonthly: 150,   extraSeatCentsMonthly: 2_000 },
  business: { baseCentsMonthly: 49_900, baseCentsAnnual: 499_000, extraHostCentsMonthly: 0 /* volume / custom */, extraSeatCentsMonthly: 2_500 },
};

export const TRIAL_HOST_LIMIT = 10;
export const TRIAL_PAID_SEAT_LIMIT = 2;
export const TRIAL_DAYS = 14;

export const COMMERCIAL_PLANS: Record<Exclude<CommercialPlanCode, "trial" | "enterprise">, PlanDefinition> =
  {
    starter:  { code: "starter",  label: "Starter",  hostLimit: 25,  paidSeatLimit: 2  },
    growth:   { code: "growth",   label: "Growth",   hostLimit: 100, paidSeatLimit: 5  },
    business: { code: "business", label: "Business", hostLimit: 300, paidSeatLimit: 10 },
  };

export function getPlanDefinition(code: string): PlanDefinition | null {
  if (code === "enterprise") {
    return { code: "enterprise", label: "Enterprise", hostLimit: -1, paidSeatLimit: -1 };
  }
  if (code in COMMERCIAL_PLANS) {
    return COMMERCIAL_PLANS[code as keyof typeof COMMERCIAL_PLANS];
  }
  return null;
}

/** Map high-privilege tenant roles to legacy console Role for collectors API compatibility. */
export function toLegacyApiRole(role: TenantRole): "viewer" | "auditor" | "operator" | "admin" {
  switch (role) {
    case "owner":
    case "admin":
      return "admin";
    case "operator":
      return "operator";
    case "guest_auditor":
      return "auditor";
    default:
      return "viewer";
  }
}
