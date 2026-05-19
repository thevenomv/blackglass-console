/**
 * Billing provisioning: persist BLACKGLASS_PLAN to DO Spaces when a Stripe
 * subscription is created or cancelled.
 *
 * Plan state is written to the Spaces bucket (plans/active.json) and held in
 * an in-memory TTL cache.  This avoids triggering a DO App Platform
 * redeployment for every billing event.
 *
 * Required env vars (all set via Doppler / DO app env):
 *   DO_SPACES_KEY / DO_SPACES_SECRET / DO_SPACES_BUCKET / DO_SPACES_ENDPOINT
 */

import type { Plan } from "@/lib/plan";
import { setAndPersistPlan } from "@/lib/server/plan-store";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";

interface StripeContext {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function provisionPlan(plan: Plan, _ctx: StripeContext): Promise<void> {
  // BILL-04: in SaaS/Clerk mode the plan is per-tenant (stored in
  // saas_subscriptions and synced by syncSaasSubscriptionFromStripe).
  // The global Spaces-backed plan store is only used in single-tenant mode.
  if (isClerkAuthEnabled()) {
    console.info(`[provision] SaaS mode — skipping global plan write for "${plan}"`);
    return;
  }
  try {
    await setAndPersistPlan(plan);
    console.info(`[provision] Plan set to "${plan}" (persisted to Spaces)`);
  } catch (err) {
    // Log but don't re-throw: webhook must return 200 or Stripe will retry.
    console.error("[provision] Failed to provision plan:", err);
  }
}

export async function deprovisionPlan(_ctx: StripeContext): Promise<void> {
  // BILL-04: in SaaS/Clerk mode the plan is per-tenant (stored in
  // saas_subscriptions). Skip the global store write.
  if (isClerkAuthEnabled()) {
    console.info(`[provision] SaaS mode — skipping global deprovision`);
    return;
  }
  try {
    await setAndPersistPlan("free");
    console.info(`[provision] Plan reverted to "free" (persisted to Spaces)`);
  } catch (err) {
    console.error("[provision] Failed to deprovision plan:", err);
  }
}
