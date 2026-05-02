import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

// Next.js must NOT parse the body for Stripe signature verification.
export const config = { api: { bodyParser: false } };

// App Router equivalent: disable body parsing via the route segment config.
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
      // TODO: Provision the plan for the customer.
      // The subscription ID and customer ID are available here:
      //   session.subscription  (Stripe subscription ID)
      //   session.customer      (Stripe customer ID)
      //   session.customer_email
      //
      // At minimum, store { stripeCustomerId, stripeSubscriptionId, plan: "pro" }
      // against a user record so the app can call getLimits() for real data.
      console.info(
        `[stripe/webhook] checkout.session.completed — customer=${session.customer} sub=${session.subscription}`,
      );
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      // TODO: Downgrade the customer back to the free plan when their
      // subscription is cancelled or lapses.
      console.info(
        `[stripe/webhook] subscription.deleted — sub=${subscription.id} customer=${subscription.customer}`,
      );
      break;
    }

    default:
      // Ignore all other event types.
      break;
  }

  return NextResponse.json({ received: true });
}
