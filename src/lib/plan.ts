/**
 * BLACKGLASS plan definitions.
 *
 * Set BLACKGLASS_PLAN=free|pro|enterprise at runtime (DO env var or Doppler).
 * Defaults to "free" so unset deployments get the correct limits.
 *
 * No billing logic here — plan is asserted by the operator at deploy time.
 * When Stripe/billing is added, replace getPlan() with a DB lookup.
 */

import { createRequire } from "node:module";
import { NextResponse } from "next/server";

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
    label: "BLACKGLASS Local",
    maxHosts: 3,
    maxUsers: 1,
    scheduledScans: false,
    multiUser: false,
    webhooks: false,
    evidenceExport: false,
    sso: false,
    auditExport: false,
    apiAccess: false,
    retentionDays: 30,
  },
  pro: {
    name: "pro",
    label: "BLACKGLASS Team",
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
    label: "BLACKGLASS Fleet",
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

/** Resolved relative to this file — keeps `@aws-sdk` out of unrelated client bundles. */
const loadPlanStore = createRequire(import.meta.url);

export function getPlan(): Plan {
  // Prefer the in-memory plan-store cache (updated by Stripe webhooks without
  // requiring a DO redeployment) over the static env var.  Falls back to env
  // so local dev and CI continue to work with BLACKGLASS_PLAN set directly.
  try {
    const { getActivePlan } = loadPlanStore("./server/plan-store") as {
      getActivePlan: () => Plan;
    };
    return getActivePlan();
  } catch {
    const raw = process.env.BLACKGLASS_PLAN?.toLowerCase().trim();
    if (raw && VALID_PLANS.includes(raw as Plan)) return raw as Plan;
    return "free";
  }
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

// ---------------------------------------------------------------------------
// PlanGuard — centralised plan feature enforcement for API route handlers.
//
// Usage (in a route handler):
//   const guard = planGuard("scheduledScans");
//   if (!guard.ok) return guard.response;
// ---------------------------------------------------------------------------

type BooleanPlanFeature = {
  [K in keyof PlanLimits]: PlanLimits[K] extends boolean ? K : never;
}[keyof PlanLimits];

type PlanGuardOk = { ok: true };
type PlanGuardFail = { ok: false; response: ReturnType<typeof NextResponse.json> };
export type PlanGuardResult = PlanGuardOk | PlanGuardFail;

/**
 * Returns `{ ok: true }` when the current plan has the feature enabled,
 * otherwise returns `{ ok: false, response }` with a 402 JSON error ready
 * to return from a route handler.
 */
export function planGuard(feature: BooleanPlanFeature): PlanGuardResult {
  const limits = getLimits();
  if (limits[feature]) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "plan_limit",
        detail: `Feature "${feature}" is not available on the "${limits.name}" plan.`,
        upgrade_required: true,
      },
      { status: 402 },
    ),
  };
}

/**
 * Returns `{ ok: true }` when adding one more host is within the plan cap,
 * otherwise a 402 response.
 */
export function hostCapGuard(currentCount: number): PlanGuardResult {
  const limits = getLimits();
  if (withinHostCap(currentCount)) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "plan_limit",
        detail: `Host cap of ${limits.maxHosts} reached on the "${limits.name}" plan.`,
        upgrade_required: true,
      },
      { status: 402 },
    ),
  };
}

