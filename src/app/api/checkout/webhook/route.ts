import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { provisionPlan, deprovisionPlan } from "@/lib/billing/provision";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import type Stripe from "stripe";

// Stripe signature verification requires the raw POST body — use `request.text()` (not `.json()`).

// App Router: ensure fresh execution (no static caching of webhook responses).
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Idempotency guard — Stripe may redeliver the same event on transient failures.
// This in-process Set deduplicates within a single replica. For multi-instance
// deployments, move this to a shared store (Redis/DB) at Stage 3.
// ---------------------------------------------------------------------------
const MAX_DEDUP = 1_000;
const processedEventIds = new Set<string>();

function isDuplicateEvent(eventId: string): boolean {
  if (processedEventIds.has(eventId)) return true;
  // Bounded FIFO eviction — Set preserves insertion order.
  if (processedEventIds.size >= MAX_DEDUP) {
    const oldest = processedEventIds.values().next().value;
    if (oldest !== undefined) processedEventIds.delete(oldest);
  }
  processedEventIds.add(eventId);
  return false;
}

export async function POST(request: Request) {
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

  switch (event.type) {
    // Deduplicate redelivered events before any state mutation.
    // Stripe guarantees at-least-once delivery, not exactly-once.
    default:
      if (isDuplicateEvent(event.id)) {
        console.info(`[stripe/webhook] duplicate event ${event.id} — skipping`);
        return NextResponse.json({ received: true });
      }
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? "unknown";
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? "unknown";
      console.info(`[stripe/webhook] checkout.session.completed — customer=${customerId} sub=${subscriptionId}`);
      await provisionPlan("pro", { stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId });
      appendAudit({ action: AUDIT_ACTIONS.CHECKOUT_COMPLETED, detail: `customer=${customerId} sub=${subscriptionId}` });
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      console.info(`[stripe/webhook] subscription.deleted — sub=${subscription.id} customer=${customerId}`);
      await deprovisionPlan({ stripeCustomerId: customerId, stripeSubscriptionId: subscription.id });
      appendAudit({ action: AUDIT_ACTIONS.PLAN_REVERTED, detail: `sub=${subscription.id} customer=${customerId}` });
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
        }).catch(() => {});
      }
      break;
    }

    default:
      // Ignore all other event types.
      break;
  }

  return NextResponse.json({ received: true });
}
