import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { provisionPlan, deprovisionPlan } from "@/lib/billing/provision";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { checkStripeWebhookRate, clientIp } from "@/lib/server/rate-limit";
import { tryGetDb } from "@/db";
import {
  syncSaasSubscriptionFromStripe,
  getTenantIdByStripeCustomer,
  clearStripeSubscriptionForTenant,
} from "@/lib/saas/stripe-sync";
import { claimWebhookEvent } from "@/lib/saas/webhook-idempotency";
import { emitSaasSecurity } from "@/lib/saas/event-log";
import type Stripe from "stripe";

// Stripe signature verification requires the raw POST body — use `request.text()` (not `.json()`).

// App Router: ensure fresh execution (no static caching of webhook responses).
export const dynamic = "force-dynamic";

async function maybeSyncSaasSubscription(sub: Stripe.Subscription): Promise<void> {
  if (!tryGetDb()) return;
  try {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const tenantId = await getTenantIdByStripeCustomer(customerId);
    if (!tenantId) return;
    await syncSaasSubscriptionFromStripe({
      tenantId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      subscription: sub,
    });
  } catch (e) {
    console.error("[stripe/webhook] saas subscription sync failed:", e);
  }
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!(await checkStripeWebhookRate(ip))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[stripe/webhook] Signature verification failed: ${message}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const firstDelivery = await claimWebhookEvent("stripe", event.id);
  if (!firstDelivery) {
    console.info(`[stripe/webhook] duplicate event ${event.id} — skipping`);
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? "unknown";
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? "unknown";
      console.info(`[stripe/webhook] checkout.session.completed — customer=${customerId} sub=${subscriptionId}`);
      await provisionPlan("pro", { stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId });
      appendAudit({ action: AUDIT_ACTIONS.CHECKOUT_COMPLETED, detail: `customer=${customerId} sub=${subscriptionId}` });
      if (tryGetDb() && subscriptionId !== "unknown" && customerId !== "unknown") {
        try {
          const meta = session.metadata ?? {};
          const tenantId = typeof meta.saas_tenant_id === "string" ? meta.saas_tenant_id : null;
          if (tenantId) {
            const fullSub = await stripe.subscriptions.retrieve(subscriptionId);
            await syncSaasSubscriptionFromStripe({
              tenantId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: fullSub.id,
              subscription: fullSub,
            });
          }
        } catch (e) {
          console.error("[stripe/webhook] saas checkout sync failed:", e);
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      console.info(`[stripe/webhook] subscription.deleted — sub=${subscription.id} customer=${customerId}`);
      await deprovisionPlan({ stripeCustomerId: customerId, stripeSubscriptionId: subscription.id });
      appendAudit({ action: AUDIT_ACTIONS.PLAN_REVERTED, detail: `sub=${subscription.id} customer=${customerId}` });
      if (tryGetDb()) {
        try {
          const tenantId = await getTenantIdByStripeCustomer(customerId);
          if (tenantId) await clearStripeSubscriptionForTenant(tenantId);
        } catch (e) {
          console.error("[stripe/webhook] saas detach failed:", e);
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      // Re-evaluate plan on every status change (upgrade, downgrade, cancellation at period end).
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      console.info(`[stripe/webhook] subscription.updated — sub=${subscription.id} status=${subscription.status}`);
      if (subscription.status === "active") {
        // Reactivation or plan change back to active — re-assert pro.
        await provisionPlan("pro", { stripeCustomerId: customerId, stripeSubscriptionId: subscription.id });
        appendAudit({ action: AUDIT_ACTIONS.PLAN_CHANGED, detail: `Subscription reactivated/updated — sub=${subscription.id} customer=${customerId}` });
      } else if (subscription.status === "canceled" || subscription.status === "unpaid") {
        // Hard cancellation or unpaid — revert to free immediately.
        await deprovisionPlan({ stripeCustomerId: customerId, stripeSubscriptionId: subscription.id });
        appendAudit({ action: AUDIT_ACTIONS.PLAN_REVERTED, detail: `Subscription ${subscription.status} — sub=${subscription.id} customer=${customerId}` });
      } else {
        // past_due, trialing, paused — log only; don't change plan until definitely cancelled.
        console.warn(`[stripe/webhook] subscription.updated non-terminal status: ${subscription.status} — sub=${subscription.id}`);
      }
      await maybeSyncSaasSubscription(subscription);
      break;
    }

    case "invoice.payment_succeeded": {
      // Renewal payment succeeded — re-assert plan in case a previous Spaces write failed.
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? "unknown";
      const subRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id ?? null;
      console.info(`[stripe/webhook] invoice.payment_succeeded — invoice=${invoice.id} customer=${customerId} amount=${invoice.amount_paid}`);
      if (subscriptionId) {
        // Re-assert pro plan so a prior Spaces outage doesn't leave the tenant on free.
        await provisionPlan("pro", { stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId });
        try {
          const fullSub = await stripe.subscriptions.retrieve(subscriptionId);
          await maybeSyncSaasSubscription(fullSub);
        } catch (e) {
          console.error("[stripe/webhook] saas invoice sync:", e);
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      // Payment failed: alert ops and emit an audit event for the compliance trail.
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? "unknown";
      console.warn(`[stripe/webhook] invoice.payment_failed — invoice=${invoice.id} customer=${customerId}`);
      appendAudit({ action: AUDIT_ACTIONS.INVOICE_PAYMENT_FAILED, detail: `invoice=${invoice.id} customer=${customerId} amount=${invoice.amount_due}` });
      const slackUrl = process.env.SLACK_ALERT_WEBHOOK_URL;
      if (slackUrl) {
        await fetch(slackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: `:credit_card: *Stripe payment failed* — customer \`${customerId}\` invoice \`${invoice.id}\`` }),
        }).catch((err: unknown) => {
          console.error("[stripe/webhook] Slack alert delivery failed:", err);
        });
      }
      break;
    }

    default:
      console.warn(`[stripe/webhook] Unhandled event type "${event.type}" — skipping`);
      break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe/webhook] handler failed", event.type, msg);
    if (tryGetDb()) {
      try {
        const data = event.data.object as { customer?: string | { id?: string } | null };
        const c = data.customer;
        const customerId = typeof c === "string" ? c : c?.id ?? null;
        if (customerId) {
          const tenantId = await getTenantIdByStripeCustomer(customerId);
          if (tenantId) {
            await emitSaasSecurity({
              tenantId,
              severity: "high",
              eventType: "stripe_webhook_handler_failed",
              metadata: { event_type: event.type, error: msg.slice(0, 500) },
            });
          }
        }
      } catch {
        /* best-effort */
      }
    }
    return NextResponse.json({ received: false, error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
