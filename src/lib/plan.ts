/**
 * BLACKGLASS plan definitions.
 *
 * Set BLACKGLASS_PLAN=free|pro|enterprise at runtime (DO env var or Doppler).
 * Defaults to "free" so unset deployments get the correct limits.
 *
 * No billing logic here — plan is asserted by the operator at deploy time.
 * When Stripe/billing is added, replace getPlan() with a DB lookup.
 */

export type Plan = "free" | "pro" | "enterprise";

export interface PlanLimits {
  name: string;
  label: string;            // display name
  maxHosts: number;         // -1 = unlimited
  maxUsers: number;         // -1 = unlimited
  scheduledScans: boolean;
  multiUser: boolean;
  webhooks: boolean;
  evidenceExport: boolean;
  sso: boolean;
  auditExport: boolean;
  apiAccess: boolean;
  retentionDays: number;    // -1 = unlimited
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    name: "free",
    label: "Blackglass Local",
    maxHosts: 3,
    maxUsers: 1,
    scheduledScans: false,
    multiUser: false,
    webhooks: false,
    evidenceExport: true,   // basic single-host export always free
    sso: false,
    auditExport: false,
    apiAccess: false,
    retentionDays: 30,
  },
  pro: {
    name: "pro",
    label: "Blackglass Team",
    maxHosts: 25,
    maxUsers: 5,
    scheduledScans: true,
    multiUser: true,
    webhooks: true,
    evidenceExport: true,
    sso: false,
    auditExport: true,
    apiAccess: true,
    retentionDays: 180,
  },
  enterprise: {
    name: "enterprise",
    label: "Blackglass Fleet",
    maxHosts: -1,
    maxUsers: -1,
    scheduledScans: true,
    multiUser: true,
    webhooks: true,
    evidenceExport: true,
    sso: true,
    auditExport: true,
    apiAccess: true,
    retentionDays: -1,
  },
};

const VALID_PLANS: Plan[] = ["free", "pro", "enterprise"];

export function getPlan(): Plan {
  const raw = process.env.BLACKGLASS_PLAN?.toLowerCase().trim();
  if (raw && VALID_PLANS.includes(raw as Plan)) return raw as Plan;
  return "free";
}

export function getLimits(): PlanLimits {
  return PLAN_LIMITS[getPlan()];
}

export function withinHostCap(currentCount: number): boolean {
  const { maxHosts } = getLimits();
  return maxHosts === -1 || currentCount < maxHosts;
}

export function atHostCap(currentCount: number): boolean {
  return !withinHostCap(currentCount);
}
