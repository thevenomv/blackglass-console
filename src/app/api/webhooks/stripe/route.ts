/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook receiver.  Handles subscription lifecycle events to keep the
 * saas_subscriptions table and plan cache in sync with Stripe.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY          — sk_live_* or sk_test_*
 *   STRIPE_WEBHOOK_SECRET      — whsec_* from the Stripe webhook dashboard
 *
 * Events handled:
 *   checkout.session.completed          — initial subscription creation
 *   customer.subscription.updated       — plan change / renewal
 *   customer.subscription.deleted       — cancellation
 *   invoice.payment_failed              — surfaces billing degraded state
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { tryGetDb, withBypassRls, schema } from "@/db";
import { eq } from "drizzle-orm";
import { claimWebhookEvent } from "@/lib/saas/webhook-idempotency";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { setCachedPlan, persistPlanToSpaces } from "@/lib/server/plan-store";
import { checkStripeWebhookRate, clientIpFromHeaders } from "@/lib/server/rate-limit";
import type { Plan } from "@/lib/plan";

const { saasSubscriptions, saasTenants } = schema;

// ---------------------------------------------------------------------------
// Stripe plan code → BLACKGLASS plan mapping
// ---------------------------------------------------------------------------

const PRICE_TO_PLAN: Record<string, Plan> = {
  // Populated from STRIPE_*_PRICE_ID env vars at request time so no redeploy needed
};

function priceIdToPlan(priceId: string): Plan {
  const env = process.env;
  if (priceId === env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === env.STRIPE_ENTERPRISE_PRICE_ID) return "enterprise";
  return PRICE_TO_PLAN[priceId] ?? "free";
}

function subscriptionStatusToDb(
  stripeStatus: string,
): typeof saasSubscriptions.$inferInsert["status"] {
  const map: Record<string, typeof saasSubscriptions.$inferInsert["status"]> = {
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    incomplete: "past_due",
    incomplete_expired: "canceled",
    unpaid: "past_due",
  };
  return map[stripeStatus] ?? "active";
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 501 });
  }

  const h = await headers();
  const ip = clientIpFromHeaders(h);
  if (!(await checkStripeWebhookRate(ip))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const payload = await request.text();
  const sigHeader = h.get("stripe-signature");
  if (!sigHeader) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  // Verify signature using Stripe's SDK
  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      apiVersion: "2024-12-18.acacia" as Parameters<typeof Stripe>[1]["apiVersion"],
    });
    event = stripe.webhooks.constructEvent(payload, sigHeader, secret) as typeof event;
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (!tryGetDb()) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  // Idempotency guard
  if (!(await claimWebhookEvent("stripe", event.id))) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    console.error("[stripe-webhook] Handler error:", err);
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleEvent(event: {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}): Promise<void> {
  const obj = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const customerId = obj.customer as string | undefined;
      const subscriptionId = obj.subscription as string | undefined;
      const tenantId = (obj.metadata as Record<string, string> | undefined)?.saas_tenant_id;
      if (!tenantId || !subscriptionId) break;
      await syncSubscription(tenantId, customerId ?? null, subscriptionId, "active", null, null);
      await emitSaasAudit({
        tenantId,
        action: "plan.checkout_completed",
        metadata: { stripeEventId: event.id, subscriptionId },
      });
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const stripeSubId = obj.id as string;
      const customerId = obj.customer as string;
      const stripeStatus = obj.status as string;
      const cancelAtPeriodEnd = obj.cancel_at_period_end as boolean | undefined;
      const currentPeriodEnd = obj.current_period_end as number | undefined;
      const items = (obj.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data;
      const priceId = items?.[0]?.price?.id;
      const plan = priceId ? priceIdToPlan(priceId) : undefined;

      // Find the tenant by stripe subscription id
      const db = tryGetDb()!;
      const rows = await withBypassRls((bdb) =>
        bdb
          .select({ id: saasSubscriptions.tenantId })
          .from(saasSubscriptions)
          .where(eq(saasSubscriptions.stripeSubscriptionId, stripeSubId))
          .limit(1),
      );
      const tenantId = rows[0]?.id;
      if (!tenantId) break;

      const dbStatus = subscriptionStatusToDb(
        event.type === "customer.subscription.deleted" ? "canceled" : stripeStatus,
      );
      const periodEndsAt = currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000)
        : null;

      await withBypassRls((bdb) =>
        bdb
          .update(saasSubscriptions)
          .set({
            status: cancelAtPeriodEnd ? "past_due" : dbStatus,
            currentPeriodEndsAt: periodEndsAt ?? undefined,
            stripeCustomerId: customerId,
            updatedAt: new Date(),
            ...(plan ? { planCode: plan } : {}),
          })
          .where(eq(saasSubscriptions.stripeSubscriptionId, stripeSubId)),
      );

      if (plan) {
        setCachedPlan(plan);
        void persistPlanToSpaces(plan);
      }

      await emitSaasAudit({
        tenantId,
        action: event.type === "customer.subscription.deleted" ? "plan.canceled" : "plan.changed",
        metadata: { stripeEventId: event.id, status: dbStatus, plan: plan ?? "unknown" },
      });
      break;
    }

    case "invoice.payment_failed": {
      const subscriptionId = obj.subscription as string | undefined;
      if (!subscriptionId) break;
      await withBypassRls((bdb) =>
        bdb
          .update(saasSubscriptions)
          .set({ status: "past_due", updatedAt: new Date() })
          .where(eq(saasSubscriptions.stripeSubscriptionId, subscriptionId)),
      );
      break;
    }

    default:
      // Unhandled event type — log and acknowledge
      console.info(`[stripe-webhook] Unhandled event type: ${event.type}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function syncSubscription(
  tenantId: string,
  customerId: string | null,
  subscriptionId: string,
  status: typeof saasSubscriptions.$inferInsert["status"],
  periodEndsAt: Date | null,
  plan: Plan | null,
): Promise<void> {
  await withBypassRls((db) =>
    db
      .update(saasSubscriptions)
      .set({
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: subscriptionId,
        status,
        currentPeriodEndsAt: periodEndsAt ?? undefined,
        ...(plan ? { planCode: plan } : {}),
        updatedAt: new Date(),
      })
      .where(eq(saasSubscriptions.tenantId, tenantId)),
  );
}
