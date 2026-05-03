import type { SaasSubscription } from "@/db/schema";
import { hasPermission } from "./permissions";
import type { TenantRole } from "./tenant-role";
import {
  isSubscriptionOperational,
  operationalBlockReason,
} from "./trial";
import { TRIAL_READ_ONLY } from "./trial-messages";

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
