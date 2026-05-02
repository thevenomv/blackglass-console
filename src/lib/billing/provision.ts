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

interface StripeContext {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function provisionPlan(plan: Plan, _ctx: StripeContext): Promise<void> {
  try {
    await setAndPersistPlan(plan);
    console.info(`[provision] Plan set to "${plan}" (persisted to Spaces)`);
  } catch (err) {
    // Log but don't re-throw: webhook must return 200 or Stripe will retry.
    console.error("[provision] Failed to provision plan:", err);
  }
}

export async function deprovisionPlan(_ctx: StripeContext): Promise<void> {
  try {
    await setAndPersistPlan("free");
    console.info(`[provision] Plan reverted to "free" (persisted to Spaces)`);
  } catch (err) {
    console.error("[provision] Failed to deprovision plan:", err);
  }
}
