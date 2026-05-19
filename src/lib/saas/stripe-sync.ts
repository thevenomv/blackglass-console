import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { withBypassRls, schema } from "@/db";
import {
  getPlanDefinition,
  STRIPE_CHARON_ADDON_ENV_VARS,
  STRIPE_PRICE_ENV_VARS,
  TRIAL_HOST_LIMIT,
  TRIAL_PAID_SEAT_LIMIT,
  type CommercialPlanCode,
} from "@/lib/saas/plans";
import { emitSaasAudit } from "@/lib/saas/event-log";

type SubRow = typeof schema.saasSubscriptions.$inferSelect;

/**
 * Resolve a Stripe price id to one of our plan codes, or null if unknown.
 *
 * Iterates the central STRIPE_PRICE_ENV_VARS table so adding a new tier
 * (e.g. `scale`) doesn't require touching this file beyond declaring
 * the env-var slot in plans.ts. Both monthly and annual prices map to
 * the same plan code — annual is a billing cycle, not a tier.
 *
 * Legacy `STRIPE_PRO_PRICE_ID` falls back to Starter so customers on
 * the old "pro" SKU continue to load with sane defaults until they
 * resubscribe.
 *
 * BILL-05: returns null for unrecognised price IDs instead of silently
 * defaulting to "starter", so callers can skip the sync rather than
 * inadvertently downgrading the tenant.
 */
export function priceIdToPlanCode(priceId: string | undefined): CommercialPlanCode | null {
  if (!priceId) return null;
  for (const [code, vars] of Object.entries(STRIPE_PRICE_ENV_VARS) as Array<
    [CommercialPlanCode, { monthly: string; annual: string }]
  >) {
    const monthly = process.env[vars.monthly]?.trim();
    const annual = process.env[vars.annual]?.trim();
    if (monthly && priceId === monthly) return code;
    if (annual && priceId === annual) return code;
  }
  const legacyPro = process.env.STRIPE_PRO_PRICE_ID?.trim();
  if (legacyPro && priceId === legacyPro) return "starter";
  // BILL-05: unknown price ID — warn and return null so the caller skips sync.
  console.warn(`[stripe-sync] unrecognised Stripe price ID "${priceId}" — skipping plan sync`);
  return null;
}

function subscriptionHasCharonLineItem(subscription: Stripe.Subscription): boolean {
  const monthly = process.env[STRIPE_CHARON_ADDON_ENV_VARS.monthly]?.trim();
  const annual = process.env[STRIPE_CHARON_ADDON_ENV_VARS.annual]?.trim();
  if (!monthly && !annual) return false;
  for (const item of subscription.items.data) {
    const pid = item.price?.id;
    if (!pid || typeof pid !== "string") continue;
    if (monthly && pid === monthly) return true;
    if (annual && pid === annual) return true;
  }
  return false;
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubRow["status"] {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due") return "past_due";
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    return "canceled";
  }
  return "active";
}

/**
 * Apply Stripe subscription state to the tenant's saas_subscriptions row.
 */
export async function syncSaasSubscriptionFromStripe(input: {
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  subscription: Stripe.Subscription;
}): Promise<void> {
  // BILL-06: iterate all line items and pick the first one whose price ID
  // maps to a known base plan. Add-ons (Remediator, Charon) are separate
  // price IDs that priceIdToPlanCode returns null for, so they are skipped.
  let planCode: CommercialPlanCode | null = null;
  let priceId: string | undefined;
  for (const item of input.subscription.items.data) {
    const pid = typeof item.price?.id === "string" ? item.price.id : undefined;
    const code = priceIdToPlanCode(pid);
    if (code !== null) {
      planCode = code;
      priceId = pid;
      break;
    }
  }
  // BILL-05: if no recognised base-plan price ID was found, skip sync entirely.
  if (planCode === null) {
    console.warn(
      `[stripe-sync] no known base-plan price found in subscription ${input.stripeSubscriptionId} — skipping sync`,
    );
    return;
  }
  const def = getPlanDefinition(planCode);
  const hostLimit = def?.hostLimit ?? 25;
  const paidSeatLimit = def?.paidSeatLimit ?? 3;
  const status = mapStripeStatus(input.subscription.status);
  const cpe =
    "current_period_end" in input.subscription &&
    typeof (input.subscription as { current_period_end: number }).current_period_end === "number"
      ? (input.subscription as { current_period_end: number }).current_period_end
      : null;
  const currentPeriodEndsAt = cpe ? new Date(cpe * 1000) : null;
  const trialEndRaw =
    "trial_end" in input.subscription &&
    typeof (input.subscription as { trial_end: number }).trial_end === "number"
      ? (input.subscription as { trial_end: number }).trial_end
      : null;
  const trialEndsAt =
    input.subscription.status === "trialing" && trialEndRaw ? new Date(trialEndRaw * 1000) : null;

  const charonAddonLine = subscriptionHasCharonLineItem(input.subscription);

  // RLS-BYPASS: signature-verified Stripe webhook handler; no tenant
  // session yet. input.tenantId resolved earlier from the verified Stripe
  // customer id; this write applies the new plan state to that tenant row.
  await withBypassRls(async (db) => {
    const [existing] = await db
      .select({ features: schema.saasSubscriptions.features })
      .from(schema.saasSubscriptions)
      .where(eq(schema.saasSubscriptions.tenantId, input.tenantId))
      .limit(1);

    const prev = (existing?.features as Record<string, unknown> | null) ?? {};
    const prevAddons =
      prev.addons !== null &&
      typeof prev.addons === "object" &&
      !Array.isArray(prev.addons)
        ? { ...(prev.addons as Record<string, unknown>) }
        : {};
    prevAddons.charon = charonAddonLine;
    const nextFeatures: Record<string, unknown> = { ...prev, addons: prevAddons };

    await db
      .update(schema.saasSubscriptions)
      .set({
        planCode,
        status,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        hostLimit,
        paidSeatLimit,
        currentPeriodEndsAt,
        trialEndsAt,
        features: nextFeatures,
        updatedAt: new Date(),
      })
      .where(eq(schema.saasSubscriptions.tenantId, input.tenantId));
  });

  await emitSaasAudit({
    tenantId: input.tenantId,
    actorUserId: null,
    action: "plan.synced_from_stripe",
    targetType: "stripe_subscription",
    targetId: input.stripeSubscriptionId,
    metadata: { planCode, status, priceId: priceId ?? null, charon_addon: charonAddonLine },
  });
}

export async function getTenantIdByStripeCustomer(customerId: string): Promise<string | null> {
  // RLS-BYPASS: Stripe webhook lookup — resolves a verified Stripe
  // customer id to the tenantId we stored on subscription create. No
  // tenant session exists yet; this read is the bridge.
  const rows = await withBypassRls((db) =>
    db
      .select({ tenantId: schema.saasSubscriptions.tenantId })
      .from(schema.saasSubscriptions)
      .where(eq(schema.saasSubscriptions.stripeCustomerId, customerId))
      .limit(1),
  );
  return rows[0]?.tenantId ?? null;
}

export async function clearStripeSubscriptionForTenant(tenantId: string): Promise<void> {
  // RLS-BYPASS: signature-verified Stripe customer.subscription.deleted
  // webhook; tenantId already resolved via getTenantIdByStripeCustomer.
  await withBypassRls(async (db) => {
    await db
      .update(schema.saasSubscriptions)
      .set({
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        planCode: "trial",
        status: "canceled",
        hostLimit: TRIAL_HOST_LIMIT,
        paidSeatLimit: TRIAL_PAID_SEAT_LIMIT,
        features: {},
        updatedAt: new Date(),
      })
      .where(eq(schema.saasSubscriptions.tenantId, tenantId));
  });

  await emitSaasAudit({
    tenantId,
    actorUserId: null,
    action: "plan.stripe_detached",
    targetType: "subscription",
    targetId: tenantId,
    metadata: {},
  });
}
