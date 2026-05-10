import type { TenantRole } from "./tenant-role";

/**
 * Commercial plan codes.
 *
 * `trial` is the bootstrap state every new tenant lands in for 14 days.
 * `lab` is the perpetual free tier for individuals, homelabs, and
 * evaluators — it is NOT created by Stripe and has no billing record.
 * `enterprise` is sales-led with custom limits and is never auto-assigned.
 */
export type CommercialPlanCode =
  | "trial"
  | "lab"
  | "starter"
  | "growth"
  | "scale"
  | "business"
  | "enterprise";

/** API access level granted by a plan. */
export type PlanApiAccess = "none" | "read_only" | "full";

/**
 * Canonical per-tier feature and limit declaration.
 *
 * Limits use `-1` for "unlimited" consistently — callers must check
 * for that sentinel before doing arithmetic. `0` always means "feature
 * not available on this plan" (e.g. zero concurrent sandboxes).
 */
export type PlanDefinition = {
  code: CommercialPlanCode;
  label: string;

  // Core capacity
  /** Maximum managed hosts. -1 = unlimited (Enterprise). */
  hostLimit: number;
  /**
   * Maximum operator/admin seats (owner + admin + operator roles).
   * Viewers and guest_auditors are always unlimited and never consume seats.
   * -1 = unlimited (Enterprise).
   */
  paidSeatLimit: number;

  // Retention caps (days; -1 = unlimited)
  /** Cap on per-tenant `RetentionPolicy.driftEventsDays`. */
  retentionDriftDaysMax: number;
  /** Cap on per-tenant `RetentionPolicy.auditEventsDays`. */
  retentionAuditDaysMax: number;
  /** Cap on per-tenant `RetentionPolicy.baselineSnapshotsDays`. */
  retentionBaselineDaysMax: number;
  /** Cap on per-tenant `RetentionPolicy.evidenceBundlesDays`. */
  retentionEvidenceDaysMax: number;

  // Activity caps
  /** Maximum scheduled scans per host per day. -1 = continuous. */
  scansPerDayPerHost: number;
  /** Included evidence bundles per month. -1 = unlimited. */
  evidenceBundlesPerMonth: number;
  /** Concurrent sandbox droplets allowed. 0 = none, -1 = unlimited. */
  concurrentSandboxes: number;
  /** Outbound webhook deliveries per month. -1 = unlimited. */
  webhookDeliveriesPerMonth: number;
  /** Maximum number of webhook endpoint URLs configurable. -1 = unlimited. */
  webhookEndpointsMax: number;

  // Feature toggles
  apiAccess: PlanApiAccess;
  ssoIncluded: boolean;
  byokIncluded: boolean;
  airgapIncluded: boolean;
  /** Remediator sidecar (HITL AI remediation) included by default. */
  remediatorIncluded: boolean;
  /** Whether Remediator can be purchased as an add-on at this tier. */
  remediatorAddonAvailable: boolean;
  scheduledScansEnabled: boolean;
  customEvidenceTemplates: boolean;
  hostGroupsEnabled: boolean;
  baselineApprovalWorkflows: boolean;
  immutableAuditLog: boolean;
  prioritySupport: boolean;
  supportSla: boolean;

  // Charon (cloud janitor) — enforced in `/api/v1/janitor/*` + Stripe-backed planCode
  /** Max linked cloud accounts per workspace (-1 = unlimited). */
  charonLinkedAccountsMax: number;
  /** Cleanup request queue + approvals (Lab: off — manual scans / findings only). */
  charonCleanupQueueEnabled: boolean;
  /** Live cleanup after approval (Growth+). Starter is dry-run only. */
  charonLiveCleanupEnabled: boolean;
};

/**
 * Recurring pricing knobs — all values in USD cents/month.
 *
 * Annual base is monthly × 10 (≈ 17 % off, "two months free").
 * Overage rates apply once a tenant exceeds the included quota for
 * the dimension. Soft-cap dimensions (bundles, sandboxes, deliveries)
 * are billed by overage rather than enforced as hard limits.
 */
export type PlanPricing = {
  baseCentsMonthly: number;
  baseCentsAnnual: number;

  // Hard-cap overages (per unit, monthly)
  extraHostCentsMonthly: number;
  extraSeatCentsMonthly: number;

  // Soft-cap overages (per unit beyond included quota)
  /** Per extra evidence bundle beyond the monthly quota. */
  extraEvidenceBundleCents: number;
  /** Per extra concurrent sandbox beyond the included count, monthly. */
  extraConcurrentSandboxCentsMonthly: number;
  /** Per 10,000 extra webhook deliveries beyond the monthly quota. */
  extraWebhookDeliveryCentsPerTenK: number;
};

/**
 * Optional add-ons. Independent of the base plan price.
 */
export type AddOnCode = "remediator" | "charon";

export type AddOnPricing = {
  code: AddOnCode;
  label: string;
  /** Monthly fixed price in USD cents. 0 = free, -1 = "contact sales". */
  baseCentsMonthly: number;
  baseCentsAnnual: number;
  /** Optional usage cap before per-action overage applies. -1 = unlimited. */
  includedActionsPerMonth: number;
  /** USD cents per action above the included quota. */
  extraActionCents: number;
};

// ---------------------------------------------------------------------------
// Tier ladder — Lab (free) → Starter → Growth → Scale → Business → Enterprise
//
// The ladder is intentionally six tiers. Lab is the perpetual free entry
// point that removes the "but Wazuh is free" objection. Scale fills the
// 100→300 host gap that previously forced customers to negotiate or
// churn. Enterprise is sales-led with a published anchor, not a black box.
// ---------------------------------------------------------------------------

export const TRIAL_HOST_LIMIT = 10;
export const TRIAL_PAID_SEAT_LIMIT = 2;
export const TRIAL_DAYS = 14;

/** Public anchor for the marketing page Enterprise card. USD cents/month. */
export const ENTERPRISE_PRICE_ANCHOR_CENTS_MONTHLY = 150_000; // $1,500

/**
 * Canonical commercial plan definitions.
 *
 * Trial inherits the same shape but reuses the Starter feature set with
 * the two trial caps applied — see `getPlanDefinition("trial")`.
 */
export const COMMERCIAL_PLANS: Record<
  Exclude<CommercialPlanCode, "trial" | "enterprise">,
  PlanDefinition
> = {
  lab: {
    code: "lab",
    label: "Lab",
    hostLimit: 5,
    paidSeatLimit: 1,
    retentionDriftDaysMax: 30,
    retentionAuditDaysMax: 30,
    retentionBaselineDaysMax: 30,
    retentionEvidenceDaysMax: 7,
    scansPerDayPerHost: 1,
    evidenceBundlesPerMonth: 0,
    concurrentSandboxes: 0,
    webhookDeliveriesPerMonth: 0,
    webhookEndpointsMax: 0,
    apiAccess: "read_only",
    ssoIncluded: false,
    byokIncluded: false,
    airgapIncluded: false,
    remediatorIncluded: false,
    remediatorAddonAvailable: false,
    scheduledScansEnabled: false,
    customEvidenceTemplates: false,
    hostGroupsEnabled: false,
    baselineApprovalWorkflows: false,
    immutableAuditLog: false,
    prioritySupport: false,
    supportSla: false,
    charonLinkedAccountsMax: 1,
    charonCleanupQueueEnabled: false,
    charonLiveCleanupEnabled: false,
  },
  starter: {
    code: "starter",
    label: "Starter",
    hostLimit: 10,
    paidSeatLimit: 2,
    retentionDriftDaysMax: 30,
    retentionAuditDaysMax: 90,
    retentionBaselineDaysMax: 30,
    retentionEvidenceDaysMax: 30,
    scansPerDayPerHost: 4,
    evidenceBundlesPerMonth: 1,
    concurrentSandboxes: 0,
    webhookDeliveriesPerMonth: 10_000,
    webhookEndpointsMax: 1,
    apiAccess: "read_only",
    ssoIncluded: false,
    byokIncluded: false,
    airgapIncluded: false,
    remediatorIncluded: false,
    remediatorAddonAvailable: false,
    scheduledScansEnabled: true,
    customEvidenceTemplates: false,
    hostGroupsEnabled: false,
    baselineApprovalWorkflows: false,
    immutableAuditLog: false,
    prioritySupport: false,
    supportSla: false,
    charonLinkedAccountsMax: 5,
    charonCleanupQueueEnabled: true,
    charonLiveCleanupEnabled: false,
  },
  growth: {
    code: "growth",
    label: "Growth",
    hostLimit: 100,
    paidSeatLimit: 5,
    retentionDriftDaysMax: 180,
    retentionAuditDaysMax: 365,
    retentionBaselineDaysMax: 180,
    retentionEvidenceDaysMax: 180,
    scansPerDayPerHost: 24,
    evidenceBundlesPerMonth: 5,
    concurrentSandboxes: 1,
    webhookDeliveriesPerMonth: 100_000,
    webhookEndpointsMax: 5,
    apiAccess: "full",
    ssoIncluded: false,
    byokIncluded: false,
    airgapIncluded: false,
    remediatorIncluded: false,
    remediatorAddonAvailable: true,
    scheduledScansEnabled: true,
    customEvidenceTemplates: true,
    hostGroupsEnabled: false,
    baselineApprovalWorkflows: false,
    immutableAuditLog: false,
    prioritySupport: true,
    supportSla: false,
    charonLinkedAccountsMax: 25,
    charonCleanupQueueEnabled: true,
    charonLiveCleanupEnabled: true,
  },
  scale: {
    code: "scale",
    label: "Scale",
    hostLimit: 200,
    paidSeatLimit: 7,
    retentionDriftDaysMax: 365,
    retentionAuditDaysMax: 730,
    retentionBaselineDaysMax: 365,
    retentionEvidenceDaysMax: 365,
    scansPerDayPerHost: 48,
    evidenceBundlesPerMonth: 25,
    concurrentSandboxes: 2,
    webhookDeliveriesPerMonth: 500_000,
    webhookEndpointsMax: 10,
    apiAccess: "full",
    ssoIncluded: false,
    byokIncluded: false,
    airgapIncluded: false,
    remediatorIncluded: false,
    remediatorAddonAvailable: true,
    scheduledScansEnabled: true,
    customEvidenceTemplates: true,
    hostGroupsEnabled: true,
    baselineApprovalWorkflows: true,
    immutableAuditLog: false,
    prioritySupport: true,
    supportSla: false,
    charonLinkedAccountsMax: 25,
    charonCleanupQueueEnabled: true,
    charonLiveCleanupEnabled: true,
  },
  business: {
    code: "business",
    label: "Business",
    hostLimit: 300,
    paidSeatLimit: 10,
    retentionDriftDaysMax: 365,
    retentionAuditDaysMax: 730,
    retentionBaselineDaysMax: 365,
    retentionEvidenceDaysMax: 365,
    scansPerDayPerHost: 96,
    evidenceBundlesPerMonth: -1,
    concurrentSandboxes: 3,
    webhookDeliveriesPerMonth: -1,
    webhookEndpointsMax: -1,
    apiAccess: "full",
    ssoIncluded: false,
    byokIncluded: false,
    airgapIncluded: false,
    remediatorIncluded: true,
    remediatorAddonAvailable: false,
    scheduledScansEnabled: true,
    customEvidenceTemplates: true,
    hostGroupsEnabled: true,
    baselineApprovalWorkflows: true,
    immutableAuditLog: true,
    prioritySupport: true,
    supportSla: false,
    charonLinkedAccountsMax: 50,
    charonCleanupQueueEnabled: true,
    charonLiveCleanupEnabled: true,
  },
};

/**
 * Recurring base + overage pricing per tier.
 *
 * Lab is omitted — it's free and has no overage pricing. Enterprise is
 * omitted — pricing is custom per contract; the marketing page renders
 * `ENTERPRISE_PRICE_ANCHOR_CENTS_MONTHLY` as a starting-point anchor.
 */
export const PLAN_PRICING: Record<
  Exclude<CommercialPlanCode, "trial" | "enterprise" | "lab">,
  PlanPricing
> = {
  starter: {
    baseCentsMonthly: 3_900,
    baseCentsAnnual: 39_000,
    extraHostCentsMonthly: 400,
    extraSeatCentsMonthly: 2_000,
    extraEvidenceBundleCents: 500,
    extraConcurrentSandboxCentsMonthly: 0,
    extraWebhookDeliveryCentsPerTenK: 100,
  },
  growth: {
    baseCentsMonthly: 19_900,
    baseCentsAnnual: 199_000,
    extraHostCentsMonthly: 200,
    extraSeatCentsMonthly: 2_500,
    extraEvidenceBundleCents: 500,
    extraConcurrentSandboxCentsMonthly: 3_000,
    extraWebhookDeliveryCentsPerTenK: 100,
  },
  scale: {
    baseCentsMonthly: 34_900,
    baseCentsAnnual: 349_000,
    extraHostCentsMonthly: 150,
    extraSeatCentsMonthly: 3_000,
    extraEvidenceBundleCents: 500,
    extraConcurrentSandboxCentsMonthly: 3_000,
    extraWebhookDeliveryCentsPerTenK: 100,
  },
  business: {
    baseCentsMonthly: 49_900,
    baseCentsAnnual: 499_000,
    extraHostCentsMonthly: 100,
    extraSeatCentsMonthly: 3_500,
    extraEvidenceBundleCents: 0,
    extraConcurrentSandboxCentsMonthly: 3_000,
    extraWebhookDeliveryCentsPerTenK: 0,
  },
};

/**
 * Add-on catalogue. Surfaced in Settings → Billing as upsell rows
 * separately from the base plan card.
 */
export const ADD_ONS: Record<AddOnCode, AddOnPricing> = {
  remediator: {
    code: "remediator",
    label: "Remediator (HITL AI remediation)",
    baseCentsMonthly: 9_900,
    baseCentsAnnual: 99_000,
    includedActionsPerMonth: 100,
    extraActionCents: 10,
  },
  /**
   * Charon — multi-cloud resource hygiene (DO, AWS, GCP read inventory + optional HITL cleanup).
   * Priced under Remediator; boosts linked-account limits when subscribed.
   */
  charon: {
    code: "charon",
    label: "Charon (cloud resource janitor)",
    baseCentsMonthly: 4_900,
    baseCentsAnnual: 49_000,
    includedActionsPerMonth: -1,
    extraActionCents: 0,
  },
};

/** Stripe recurring price IDs for the Charon add-on line item (checkout + webhook detection). */
export const STRIPE_CHARON_ADDON_ENV_VARS = {
  monthly: "STRIPE_CHARON_PRICE_ID",
  annual: "STRIPE_CHARON_ANNUAL_PRICE_ID",
} as const;

/**
 * Resolve a plan code to its full definition.
 *
 * Trial uses Starter's feature set with the trial host/seat caps applied
 * — this means trial users get a realistic preview of Starter without
 * forcing the full plan-code switch on signup.
 */
export function getPlanDefinition(code: string): PlanDefinition | null {
  if (code === "enterprise") {
    return {
      code: "enterprise",
      label: "Enterprise",
      hostLimit: -1,
      paidSeatLimit: -1,
      retentionDriftDaysMax: -1,
      retentionAuditDaysMax: 2_555, // 7 years — common SOX/PCI residency requirement
      retentionBaselineDaysMax: -1,
      retentionEvidenceDaysMax: -1,
      scansPerDayPerHost: -1,
      evidenceBundlesPerMonth: -1,
      concurrentSandboxes: -1,
      webhookDeliveriesPerMonth: -1,
      webhookEndpointsMax: -1,
      apiAccess: "full",
      ssoIncluded: true,
      byokIncluded: true,
      airgapIncluded: true,
      remediatorIncluded: true,
      remediatorAddonAvailable: false,
      scheduledScansEnabled: true,
      customEvidenceTemplates: true,
      hostGroupsEnabled: true,
      baselineApprovalWorkflows: true,
      immutableAuditLog: true,
      prioritySupport: true,
      supportSla: true,
      charonLinkedAccountsMax: -1,
      charonCleanupQueueEnabled: true,
      charonLiveCleanupEnabled: true,
    };
  }
  if (code === "trial") {
    const starter = COMMERCIAL_PLANS.starter;
    return {
      ...starter,
      code: "trial",
      label: "Trial",
      hostLimit: TRIAL_HOST_LIMIT,
      paidSeatLimit: TRIAL_PAID_SEAT_LIMIT,
    };
  }
  if (code in COMMERCIAL_PLANS) {
    return COMMERCIAL_PLANS[code as keyof typeof COMMERCIAL_PLANS];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Plan-aware helper accessors.
//
// These are convenience wrappers for callers that only need a single
// dimension of a plan. Using the helper rather than reading the field
// directly means:
//   1) callers can't accidentally miss the `-1 = unlimited` sentinel,
//   2) future schema migrations only touch one place.
// ---------------------------------------------------------------------------

/** Returns true if the plan permits at least the given API access level. */
export function planSatisfiesApiAccess(
  code: string,
  required: Exclude<PlanApiAccess, "none">,
): boolean {
  const def = getPlanDefinition(code);
  if (!def) return false;
  if (def.apiAccess === "none") return false;
  if (required === "read_only") return true;
  return def.apiAccess === "full";
}

/** Cap on a retention dimension for the plan. -1 = unlimited. */
export function maxRetentionDays(
  code: string,
  dimension: "drift" | "audit" | "baseline" | "evidence",
): number {
  const def = getPlanDefinition(code);
  if (!def) return 0;
  switch (dimension) {
    case "drift":
      return def.retentionDriftDaysMax;
    case "audit":
      return def.retentionAuditDaysMax;
    case "baseline":
      return def.retentionBaselineDaysMax;
    case "evidence":
      return def.retentionEvidenceDaysMax;
  }
}

/** True if the requested retention setting fits inside the plan cap. */
export function retentionWithinPlan(
  code: string,
  dimension: "drift" | "audit" | "baseline" | "evidence",
  requestedDays: number | null,
): boolean {
  const cap = maxRetentionDays(code, dimension);
  if (cap === -1) return true;
  if (requestedDays === null || requestedDays === 0) return true;
  return requestedDays <= cap;
}

/** Maximum scans per host per day permitted by the plan. -1 = continuous. */
export function maxScansPerDayPerHost(code: string): number {
  return getPlanDefinition(code)?.scansPerDayPerHost ?? 0;
}

/** Whether the Remediator is available on this plan (included or as add-on). */
export function remediatorAvailable(code: string): boolean {
  const def = getPlanDefinition(code);
  if (!def) return false;
  return def.remediatorIncluded || def.remediatorAddonAvailable;
}

/** Whether the Remediator costs extra (i.e. not included in the base plan). */
export function remediatorIsAddon(code: string): boolean {
  const def = getPlanDefinition(code);
  if (!def) return false;
  return !def.remediatorIncluded && def.remediatorAddonAvailable;
}

/** True when Stripe sync has recorded an active Charon subscription line item. */
export function isCharonAddonEnabled(features: unknown): boolean {
  if (!features || typeof features !== "object") return false;
  const addons = (features as { addons?: unknown }).addons;
  if (!addons || typeof addons !== "object") return false;
  return (addons as { charon?: boolean }).charon === true;
}

export type CharonEntitlements = {
  linkedAccountsMax: number;
  cleanupQueue: boolean;
  liveCleanup: boolean;
  scheduledScansAllowed: boolean;
  /** Active paid Charon add-on (see ADD_ONS.charon). */
  charonAddon: boolean;
};

/**
 * Charon (cloud janitor) limits for a workspace plan, optionally boosted by the Charon add-on.
 * Unknown / custom plan codes fall back to Starter-like caps (conservative live cleanup off).
 */
export function resolveCharonEntitlements(
  planCode: string,
  options?: { charonAddon?: boolean },
): CharonEntitlements {
  const charonAddon = options?.charonAddon ?? false;
  const def = getPlanDefinition(planCode);
  if (!def) {
    return {
      linkedAccountsMax: 5,
      cleanupQueue: true,
      liveCleanup: false,
      scheduledScansAllowed: true,
      charonAddon,
    };
  }

  let linkedAccountsMax = def.charonLinkedAccountsMax;
  let cleanupQueue = def.charonCleanupQueueEnabled;

  if (charonAddon) {
    cleanupQueue = true;
    if (planCode === "lab") {
      linkedAccountsMax = Math.max(linkedAccountsMax, 5);
    } else if (linkedAccountsMax >= 0) {
      linkedAccountsMax = Math.min(50, linkedAccountsMax + 10);
    }
  }

  return {
    linkedAccountsMax,
    cleanupQueue,
    liveCleanup: def.charonLiveCleanupEnabled,
    scheduledScansAllowed: def.scheduledScansEnabled,
    charonAddon,
  };
}

// ---------------------------------------------------------------------------
// Stripe price-id ↔ plan-code mapping.
//
// Centralised here so stripe-sync.ts and any future Stripe-related route
// share one mapping table. Each new tier needs both an env-var slot and
// an entry in this map.
// ---------------------------------------------------------------------------

export const STRIPE_PRICE_ENV_VARS: Record<
  Exclude<CommercialPlanCode, "trial" | "enterprise" | "lab">,
  { monthly: string; annual: string }
> = {
  starter: { monthly: "STRIPE_STARTER_PRICE_ID", annual: "STRIPE_STARTER_ANNUAL_PRICE_ID" },
  growth: { monthly: "STRIPE_GROWTH_PRICE_ID", annual: "STRIPE_GROWTH_ANNUAL_PRICE_ID" },
  scale: { monthly: "STRIPE_SCALE_PRICE_ID", annual: "STRIPE_SCALE_ANNUAL_PRICE_ID" },
  business: { monthly: "STRIPE_BUSINESS_PRICE_ID", annual: "STRIPE_BUSINESS_ANNUAL_PRICE_ID" },
};

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
