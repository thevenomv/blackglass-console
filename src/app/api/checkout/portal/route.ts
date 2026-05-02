import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/checkout/portal
 * Body: { customerId: string }
 *
 * Creates a Stripe Billing Portal session so customers can:
 *  - View and download invoices / receipts
 *  - Update payment method
 *  - Cancel subscription at period end
 */
export async function POST(request: Request) {
  const origin =
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  let customerId: string;
  try {
    const body = await request.json();
    customerId = body.customerId;
    if (!customerId || typeof customerId !== "string") {
      return NextResponse.json({ error: "customerId required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings/billing`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/portal] Failed to create portal session:", message);
    return NextResponse.json({ error: "Could not create portal session" }, { status: 500 });
  }
}
