import type { TenantRole } from "./tenant-role";

export type CommercialPlanCode = "starter" | "growth" | "business" | "enterprise" | "trial";

export type PlanDefinition = {
  code: CommercialPlanCode;
  label: string;
  hostLimit: number;
  paidSeatLimit: number;
};

export const TRIAL_HOST_LIMIT = 10;
export const TRIAL_PAID_SEAT_LIMIT = 2;
export const TRIAL_DAYS = 14;

export const COMMERCIAL_PLANS: Record<Exclude<CommercialPlanCode, "trial" | "enterprise">, PlanDefinition> =
  {
    starter: { code: "starter", label: "Starter", hostLimit: 25, paidSeatLimit: 3 },
    growth: { code: "growth", label: "Growth", hostLimit: 100, paidSeatLimit: 8 },
    business: { code: "business", label: "Business", hostLimit: 300, paidSeatLimit: 15 },
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
