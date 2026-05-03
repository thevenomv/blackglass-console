import type { SaasSubscription } from "@/db/schema";

export type OperationalBlockReason =
  | "trial_read_only"
  | "subscription_inactive"
  | "custom_pending"
  | null;

/** Trialing past end → read-only workspace (no ongoing operational tier). */
export function isTrialReadOnlyState(sub: SaasSubscription, now = new Date()): boolean {
  if (sub.status === "trial_expired") return true;
  if (sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt <= now) return true;
  return false;
}

export function isSubscriptionOperational(sub: SaasSubscription, now = new Date()): boolean {
  if (sub.status === "canceled") return false;
  if (isTrialReadOnlyState(sub, now)) return false;
  if (sub.status === "trialing" || sub.status === "active" || sub.status === "custom") return true;
  return false;
}

export function operationalBlockReason(sub: SaasSubscription, now = new Date()): OperationalBlockReason {
  if (sub.status === "canceled") return "subscription_inactive";
  if (isTrialReadOnlyState(sub, now)) return "trial_read_only";
  if (sub.status === "custom") {
    /* Enterprise custom — treat as operational if not expired; extend later with contract flags */
    return null;
  }
  if (sub.status === "active" || sub.status === "trialing") return null;
  return "subscription_inactive";
}
