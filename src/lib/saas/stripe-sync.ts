import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { withBypassRls, schema } from "@/db";
import {
  getPlanDefinition,
  TRIAL_HOST_LIMIT,
  TRIAL_PAID_SEAT_LIMIT,
  type CommercialPlanCode,
} from "@/lib/saas/plans";
import { emitSaasAudit } from "@/lib/saas/event-log";

type SubRow = typeof schema.saasSubscriptions.$inferSelect;

function priceIdToPlanCode(priceId: string | undefined): CommercialPlanCode {
  if (!priceId) return "starter";
  const starter = process.env.STRIPE_STARTER_PRICE_ID?.trim();
  const growth = process.env.STRIPE_GROWTH_PRICE_ID?.trim();
  const business = process.env.STRIPE_BUSINESS_PRICE_ID?.trim();
  const legacyPro = process.env.STRIPE_PRO_PRICE_ID?.trim();
  if (starter && priceId === starter) return "starter";
  if (growth && priceId === growth) return "growth";
  if (business && priceId === business) return "business";
  if (legacyPro && priceId === legacyPro) return "starter";
  return "starter";
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubRow["status"] {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
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
  const priceId = input.subscription.items.data[0]?.price?.id;
  const planCode = priceIdToPlanCode(typeof priceId === "string" ? priceId : undefined);
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

  await withBypassRls(async (db) => {
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
    metadata: { planCode, status, priceId: priceId ?? null },
  });
}

export async function getTenantIdByStripeCustomer(customerId: string): Promise<string | null> {
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
