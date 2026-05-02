import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";

export async function POST(request: Request) {
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // If you've created a recurring price in the Stripe dashboard, set
  // STRIPE_PRO_PRICE_ID and it will be used directly.  Otherwise we fall
  // back to inline price_data so you can test without dashboard setup.
  const priceId = process.env.STRIPE_PRO_PRICE_ID;

  const lineItems =    priceId
      ? [{ price: priceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Blackglass Team",
                description: "Up to 25 hosts · 5 users · scheduled scans · 180-day history",
                images: [],
              },
              unit_amount: 2900, // $29.00
              recurring: { interval: "month" as const },
            },
            quantity: 1,
          },
        ];

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: lineItems,
    success_url: `${origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing`,
    // Collect a billing email and address for invoicing.
    billing_address_collection: "auto",
    // Allow promo codes in the checkout UI.
    allow_promotion_codes: true,
    // Automatically send a receipt email after successful payment.
    payment_method_collection: "always",
    subscription_data: {
      // Pass metadata so the webhook can identify this subscription.
      metadata: { plan: "pro", source: "blackglass_checkout" },
    },
    // Attach invoice settings so every payment creates a downloadable PDF invoice.
    invoice_creation: undefined, // subscription mode creates invoices automatically
    // Auto-tax (disabled for now — enable once Stripe Tax is configured)
    // automatic_tax: { enabled: true },
    // Customer portal link shown after checkout
    after_expiration: undefined,
    consent_collection: undefined,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Could not create checkout session" }, { status: 500 });
  }

  appendAudit({ action: AUDIT_ACTIONS.CHECKOUT_STARTED, detail: `Stripe checkout session created` });
  return NextResponse.json({ url: session.url });
}
