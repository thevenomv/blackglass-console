import type { SaasSubscription } from "@/db/schema";
import { hasPermission } from "./permissions";
import { canAssignRole } from "./permissions";
import type { TenantRole } from "./tenant-role";
import {
  isSubscriptionOperational,
  operationalBlockReason,
} from "./trial";
import { TRIAL_READ_ONLY } from "./trial-messages";
import { soleOwnerDemotionBlocked } from "./member-guards";
import { canAddPaidSeat, canApplyRoleChange } from "./seats";
import { SaasAuthError } from "./auth-context";

export function canRunScansForTenant(
  role: TenantRole,
  subscription: SaasSubscription,
): { ok: true } | { ok: false; code: string; detail: string } {
  if (!hasPermission(role, "scans.run")) {
    return { ok: false, code: "forbidden", detail: "Role cannot run scans." };
  }
  if (!isSubscriptionOperational(subscription)) {
    const reason = operationalBlockReason(subscription);
    if (reason === "trial_read_only") {
      return {
        ok: false,
        code: "trial_read_only",
        detail: TRIAL_READ_ONLY.scans,
      };
    }
    return { ok: false, code: "subscription_inactive", detail: "Subscription is not active." };
  }
  return { ok: true };
}

export function canModifyBaselinesForTenant(
  role: TenantRole,
  subscription: SaasSubscription,
): { ok: true } | { ok: false; code: string; detail: string } {
  if (!hasPermission(role, "baselines.manage")) {
    return { ok: false, code: "forbidden", detail: "Role cannot modify baselines." };
  }
  if (!isSubscriptionOperational(subscription)) {
    return {
      ok: false,
      code: "trial_read_only",
      detail: TRIAL_READ_ONLY.baselines,
    };
  }
  return { ok: true };
}

export function canManageHostsForTenant(
  role: TenantRole,
  subscription: SaasSubscription,
): { ok: true } | { ok: false; code: string; detail: string } {
  const perm =
    hasPermission(role, "hosts.manage") || hasPermission(role, "hosts.manage_limited");
  if (!perm) {
    return { ok: false, code: "forbidden", detail: "Role cannot manage hosts." };
  }
  if (!isSubscriptionOperational(subscription)) {
    return {
      ok: false,
      code: "trial_read_only",
      detail: TRIAL_READ_ONLY.hosts,
    };
  }
  return { ok: true };
}

/**
 * Check whether adding one more host is within the plan's host quota.
 * Pass the number of hosts already registered (before the proposed add).
 * `subscription.hostLimit === -1` means enterprise/unlimited.
 */
export function canAddHostForTenant(
  role: TenantRole,
  subscription: SaasSubscription,
  currentHostCount: number,
): { ok: true } | { ok: false; code: string; detail: string } {
  const manage = canManageHostsForTenant(role, subscription);
  if (!manage.ok) return manage;
  const limit = subscription.hostLimit;
  if (limit === -1) return { ok: true };
  if (currentHostCount >= limit) {
    return {
      ok: false,
      code: "host_cap_exceeded",
      detail: `Your plan allows ${limit} host${limit === 1 ? "" : "s"}. Upgrade to add more.`,
    };
  }
  return { ok: true };
}

export function canGenerateReportsForTenant(
  role: TenantRole,
  subscription: SaasSubscription,
): { ok: true } | { ok: false; code: string; detail: string } {
  if (!hasPermission(role, "drift.manage")) {
    return { ok: false, code: "forbidden", detail: "Role cannot generate reports." };
  }
  if (!isSubscriptionOperational(subscription)) {
    const reason = operationalBlockReason(subscription);
    if (reason === "trial_read_only") {
      return { ok: false, code: "trial_read_only", detail: TRIAL_READ_ONLY.reports };
    }
    return { ok: false, code: "subscription_inactive", detail: "Subscription is not active." };
  }
  return { ok: true };
}

export function canRotateSecretsForTenant(
  role: TenantRole,
  subscription: SaasSubscription,
): { ok: true } | { ok: false; code: string; detail: string } {
  if (!hasPermission(role, "secrets.manage")) {
    return { ok: false, code: "forbidden", detail: "Role cannot rotate collector secrets." };
  }
  if (!isSubscriptionOperational(subscription)) {
    const reason = operationalBlockReason(subscription);
    if (reason === "trial_read_only") {
      return { ok: false, code: "trial_read_only", detail: TRIAL_READ_ONLY.secrets };
    }
    return { ok: false, code: "subscription_inactive", detail: "Subscription is not active." };
  }
  return { ok: true };
}

export function canAppendInvestigationAuditForTenant(
  role: TenantRole,
  subscription: SaasSubscription,
): { ok: true } | { ok: false; code: string; detail: string } {
  if (!hasPermission(role, "drift.manage")) {
    return { ok: false, code: "forbidden", detail: "Role cannot append audit notes." };
  }
  if (!isSubscriptionOperational(subscription)) {
    const reason = operationalBlockReason(subscription);
    if (reason === "trial_read_only") {
      return { ok: false, code: "trial_read_only", detail: TRIAL_READ_ONLY.auditAppend };
    }
    return { ok: false, code: "subscription_inactive", detail: "Subscription is not active." };
  }
  return { ok: true };
}

export function canChangeBillingForTenant(
  role: TenantRole,
  subscription: SaasSubscription,
): { ok: true } | { ok: false; code: string; detail: string } {
  if (!hasPermission(role, "billing.manage")) {
    return { ok: false, code: "forbidden", detail: "Role cannot manage billing." };
  }
  if (!isSubscriptionOperational(subscription)) {
    const reason = operationalBlockReason(subscription);
    if (reason === "trial_read_only") {
      return { ok: false, code: "trial_read_only", detail: TRIAL_READ_ONLY.billing };
    }
    if (reason === "subscription_inactive") {
      return { ok: false, code: "subscription_inactive", detail: "Subscription is not active." };
    }
  }
  return { ok: true };
}

/** Host count enforcement (caller provides current enrolled count). */
export function withinHostAllowance(
  subscription: SaasSubscription,
  currentHostCount: number,
  delta: number,
): { ok: true } | { ok: false; code: string; detail: string } {
  const limit = subscription.hostLimit;
  if (limit < 0) return { ok: true };
  if (currentHostCount + delta <= limit) return { ok: true };
  return {
    ok: false,
    code: "host_cap",
    detail: `Host allowance is ${limit} on this plan.`,
  };
}

// ---------------------------------------------------------------------------
// Throwing policy wrappers — use these in route handlers instead of manual
// `if (!can*(...)) return NextResponse.json(...)` checks.
// ---------------------------------------------------------------------------

type PolicyCtx = { role: TenantRole; subscription: SaasSubscription };

function throwPolicy(result: { ok: true } | { ok: false; code: string; detail: string }): void {
  if (!result.ok) {
    const status = result.code === "host_cap" || result.code === "seat_cap_exceeded" ? 402 : 403;
    throw new SaasAuthError(status, result.code, result.detail);
  }
}

export function ensureCanRunScan(ctx: PolicyCtx): void {
  throwPolicy(canRunScansForTenant(ctx.role, ctx.subscription));
}

export function ensureCanModifyBaselines(ctx: PolicyCtx): void {
  throwPolicy(canModifyBaselinesForTenant(ctx.role, ctx.subscription));
}

export function ensureCanManageHosts(ctx: PolicyCtx): void {
  throwPolicy(canManageHostsForTenant(ctx.role, ctx.subscription));
}

export function ensureCanGenerateReports(ctx: PolicyCtx): void {
  throwPolicy(canGenerateReportsForTenant(ctx.role, ctx.subscription));
}

export function ensureCanRotateSecrets(ctx: PolicyCtx): void {
  throwPolicy(canRotateSecretsForTenant(ctx.role, ctx.subscription));
}

export function ensureCanAppendInvestigationAudit(ctx: PolicyCtx): void {
  throwPolicy(canAppendInvestigationAuditForTenant(ctx.role, ctx.subscription));
}

export function ensureCanChangeBilling(ctx: PolicyCtx): void {
  throwPolicy(canChangeBillingForTenant(ctx.role, ctx.subscription));
}

export function ensureWithinHostAllowance(ctx: PolicyCtx, currentHostCount: number, delta = 1): void {
  throwPolicy(withinHostAllowance(ctx.subscription, currentHostCount, delta));
}

/**
 * Throws 403 if actor cannot assign `targetRole`, or 402 if the seat cap is reached.
 * `memberships` — active membership rows for the tenant (from DB); used for seat-cap math.
 */
export function ensureCanInviteWithRole(
  ctx: PolicyCtx,
  targetRole: TenantRole,
  memberships: { role: TenantRole; status: string }[],
): void {
  if (!canAssignRole(ctx.role, targetRole)) {
    throw new SaasAuthError(403, "forbidden", `Role cannot assign '${targetRole}'.`);
  }
  const seat = canAddPaidSeat(memberships, ctx.subscription.paidSeatLimit, targetRole);
  if (!seat.ok) {
    throw new SaasAuthError(402, seat.reason, "Seat cap reached. Upgrade to add paid members.");
  }
}

/**
 * Throws 403 if actor cannot assign `targetRole` or if demoting the only owner,
 * or 402 if the seat cap is exceeded after the role change.
 */
export function ensureCanChangeRole(
  ctx: PolicyCtx,
  targetRole: TenantRole,
  targetUserId: string,
  memberships: { userId: string; role: TenantRole; status: string }[],
): void {
  if (!canAssignRole(ctx.role, targetRole)) {
    throw new SaasAuthError(403, "forbidden", `Role cannot assign '${targetRole}'.`);
  }
  if (soleOwnerDemotionBlocked(memberships, targetUserId, targetRole)) {
    throw new SaasAuthError(403, "sole_owner", "Cannot demote the only active owner.");
  }
  const seat = canApplyRoleChange(memberships, targetUserId, targetRole, ctx.subscription.paidSeatLimit);
  if (!seat.ok) {
    throw new SaasAuthError(402, seat.reason, "Seat cap reached. Upgrade to change this role.");
  }
}
