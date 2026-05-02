import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // If you've created a recurring price in the Stripe dashboard, set
  // STRIPE_PRO_PRICE_ID and it will be used directly.  Otherwise we fall
  // back to inline price_data so you can test without dashboard setup.
  const priceId = process.env.STRIPE_PRO_PRICE_ID;

  const lineItems: Parameters<typeof stripe.checkout.sessions.create>[0]["line_items"] =
    priceId
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
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ];

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: lineItems,
    success_url: `${origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing`,
    // Collect a billing email even when the buyer is not logged in.
    billing_address_collection: "auto",
    // Allow promo codes in the checkout UI.
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Could not create checkout session" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
