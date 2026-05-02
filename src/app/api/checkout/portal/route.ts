import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { checkPortalRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { z } from "zod";

const PortalBodySchema = z.object({
  customerId: z
    .string()
    .min(1)
    .max(256)
    .regex(/^cus_[a-zA-Z0-9]+$/, "Invalid Stripe customer ID format (expected cus_…)"),
});

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
  if (!(await checkPortalRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many portal requests. Please wait before trying again.");
  }

  // In production, NEXT_PUBLIC_APP_URL should always be set. The https://localhost:3000
  // fallback is intentionally HTTPS to prevent plaintext return_url targets in prod.
  const origin =
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://localhost:3000";

  let customerId: string;
  try {
    const body = await request.json();
    const parsed = PortalBodySchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    customerId = parsed.data.customerId;
  } catch {
    return jsonError(400, "invalid_json", "Invalid JSON body");
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
    return jsonError(502, "stripe_portal_error", "Could not create billing portal session");
  }
}
