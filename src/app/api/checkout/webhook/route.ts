import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { provisionPlan, deprovisionPlan } from "@/lib/billing/provision";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import type Stripe from "stripe";

// Stripe signature verification requires the raw POST body — use `request.text()` (not `.json()`).

// App Router: ensure fresh execution (no static caching of webhook responses).
export const dynamic = "force-dynamic";

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
      // Handle plan changes / reactivations — no-op for now, just log.
      const subscription = event.data.object as Stripe.Subscription;
      console.info(`[stripe/webhook] subscription.updated — sub=${subscription.id} status=${subscription.status}`);
      break;
    }

    case "invoice.payment_succeeded": {
      // Renewal payment: log it so the audit trail shows recurring charges.
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? "unknown";
      console.info(`[stripe/webhook] invoice.payment_succeeded — invoice=${invoice.id} customer=${customerId} amount=${invoice.amount_paid}`);
      break;
    }

    case "invoice.payment_failed": {
      // Payment failed: log for ops visibility — send Slack alert if configured.
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? "unknown";
      console.warn(`[stripe/webhook] invoice.payment_failed — invoice=${invoice.id} customer=${customerId}`);
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
