import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { checkCheckoutRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";

export async function POST(request: Request) {
  if (!(await checkCheckoutRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many checkout requests. Please wait before trying again.");
  }

  // In production, NEXT_PUBLIC_APP_URL should always be set. The https://localhost:3000
  // fallback is intentionally HTTPS to prevent plaintext redirect targets in prod.
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000";

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
              unit_amount: Number(process.env.STRIPE_FALLBACK_PRICE_AMOUNT ?? 2900), // $29.00 default; override via STRIPE_FALLBACK_PRICE_AMOUNT
              recurring: { interval: "month" as const },
            },
            quantity: 1,
          },
        ];

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create({
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
  } catch (err) {
    console.error("[checkout] Stripe API error:", err);
    return jsonError(502, "stripe_error", "Could not create checkout session");
  }

  if (!session.url) {
    return jsonError(500, "no_checkout_url", "Stripe returned a session with no URL");
  }

  appendAudit({ action: AUDIT_ACTIONS.CHECKOUT_STARTED, detail: `Stripe checkout session created` });
  return NextResponse.json({ url: session.url });
}
