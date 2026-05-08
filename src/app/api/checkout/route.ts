import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { checkCheckoutRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { getTenantRowByClerkOrg } from "@/lib/saas/tenant-service";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkCheckoutRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many checkout requests. Please wait before trying again.", requestId);
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecret) {
    return jsonError(
      503,
      "billing_unavailable",
      "Online checkout is not enabled on this deployment. Email jamie@obsidiandynamics.co.uk or book a walkthrough — we will send you a checkout link.",
      requestId,
    );
  }

  // Prefer browser Origin; then canonical app URL; then request URL (some proxies omit Origin).
  const origin =
    request.headers.get("origin")?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;

  // Resolve Stripe price ID by plan code + billing cycle.
  //   STRIPE_<PLAN>_PRICE_ID         — monthly recurring (default)
  //   STRIPE_<PLAN>_ANNUAL_PRICE_ID  — annual recurring (≈ 10× monthly = 2 months free)
  //
  // When the annual env var is missing we fall back to inline price_data
  // with interval='year' and amount = monthly × 10 so the toggle on the
  // pricing page works against a freshly-cloned deployment without
  // operator setup.
  let planCode = "starter";
  let billingCycle: "monthly" | "annual" = "monthly";
  try {
    const body = (await request.json()) as { planCode?: string; billingCycle?: string };
    if (body?.planCode && ["starter", "growth", "business"].includes(body.planCode)) {
      planCode = body.planCode;
    }
    if (body?.billingCycle === "annual" || body?.billingCycle === "monthly") {
      billingCycle = body.billingCycle;
    }
  } catch {
    // No body or non-JSON body — use defaults.
  }

  const PLAN_PRICE_ENV: Record<string, { monthly: string | undefined; annual: string | undefined }> = {
    starter: {
      monthly: process.env.STRIPE_STARTER_PRICE_ID,
      annual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
    },
    growth: {
      monthly: process.env.STRIPE_GROWTH_PRICE_ID,
      annual: process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
    },
    business: {
      monthly: process.env.STRIPE_BUSINESS_PRICE_ID,
      annual: process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID,
    },
  };

  const PLAN_FALLBACK: Record<string, { name: string; description: string; monthlyAmount: number }> = {
    starter:  { name: "Blackglass Starter",  description: "25 hosts · 2 operator seats · 180-day history", monthlyAmount: 7900  },
    growth:   { name: "Blackglass Growth",   description: "100 hosts · 5 operator seats · fleet dashboard",  monthlyAmount: 19900 },
    business: { name: "Blackglass Business", description: "300 hosts · 10 operator seats · approval workflows", monthlyAmount: 49900 },
  };

  const priceId = PLAN_PRICE_ENV[planCode][billingCycle];
  const fallback = PLAN_FALLBACK[planCode];
  const interval: "month" | "year" = billingCycle === "annual" ? "year" : "month";
  const amount = billingCycle === "annual" ? fallback.monthlyAmount * 10 : fallback.monthlyAmount;

  const lineItems = priceId
    ? [{ price: priceId, quantity: 1 }]
    : [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${fallback.name}${billingCycle === "annual" ? " (annual)" : ""}`,
              description: fallback.description,
              images: [] as string[],
            },
            unit_amount: amount,
            recurring: { interval },
          },
          quantity: 1,
        },
      ];

  let sessionMetadata: Record<string, string> = {
    plan: planCode,
    billing_cycle: billingCycle,
    source: "blackglass_checkout",
  };
  if (isClerkAuthEnabled()) {
    const { orgId } = await auth();
    if (orgId) {
      const rows = await getTenantRowByClerkOrg(orgId);
      const tenant = rows[0];
      if (tenant) {
        sessionMetadata = {
          ...sessionMetadata,
          saas_tenant_id: tenant.id,
          clerk_org_id: orgId,
        };
      }
    }
  }

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
        metadata: { ...sessionMetadata },
      },
      metadata: sessionMetadata,
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
    return jsonError(502, "stripe_error", "Could not create checkout session. Verify STRIPE_SECRET_KEY and price IDs.", requestId);
  }

  if (!session.url) {
    return jsonError(500, "no_checkout_url", "Stripe returned a session with no URL", requestId);
  }

  appendAudit({ action: AUDIT_ACTIONS.CHECKOUT_STARTED, detail: `Stripe checkout session created`, request_id: requestId });
  return NextResponse.json(
    { url: session.url },
    { headers: requestId ? { "x-request-id": requestId } : undefined },
  );
}
