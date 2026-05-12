import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { getMarketingContactEmail } from "@/lib/marketing/contact";
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
      `Online checkout is not enabled on this deployment. Email ${getMarketingContactEmail()} or book a walkthrough — we will send you a checkout link.`,
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
  // Add-ons are recurring line items appended to the same subscription
  // so the customer pays one combined invoice. Only validated codes
  // are accepted; anything else is silently dropped (vs erroring) so
  // a stale frontend can't break checkout entirely.
  let addons: ReadonlyArray<"remediator" | "charon"> = [];
  try {
    const body = (await request.json()) as {
      planCode?: string;
      billingCycle?: string;
      addons?: unknown;
    };
    if (body?.planCode && ["starter", "team", "growth", "scale", "business"].includes(body.planCode)) {
      planCode = body.planCode;
    }
    if (body?.billingCycle === "annual" || body?.billingCycle === "monthly") {
      billingCycle = body.billingCycle;
    }
    if (Array.isArray(body?.addons)) {
      const valid = body.addons.filter((a): a is "remediator" | "charon" => a === "remediator" || a === "charon");
      // De-dupe — Stripe rejects line_items with duplicate price IDs.
      addons = Array.from(new Set(valid));
    }
  } catch {
    // No body or non-JSON body — use defaults.
  }

  const PLAN_PRICE_ENV: Record<string, { monthly: string | undefined; annual: string | undefined }> = {
    starter: {
      monthly: process.env.STRIPE_STARTER_PRICE_ID,
      annual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
    },
    team: {
      monthly: process.env.STRIPE_TEAM_PRICE_ID,
      annual: process.env.STRIPE_TEAM_ANNUAL_PRICE_ID,
    },
    growth: {
      monthly: process.env.STRIPE_GROWTH_PRICE_ID,
      annual: process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
    },
    scale: {
      monthly: process.env.STRIPE_SCALE_PRICE_ID,
      annual: process.env.STRIPE_SCALE_ANNUAL_PRICE_ID,
    },
    business: {
      monthly: process.env.STRIPE_BUSINESS_PRICE_ID,
      annual: process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID,
    },
  };

  // Inline fallback pricing keeps a freshly-cloned deployment functional
  // without requiring an operator to set every env var. Amounts are in
  // USD cents and MUST stay in sync with PLAN_PRICING in
  // src/lib/saas/plans.ts (single source of truth for the docs / FAQ).
  const PLAN_FALLBACK: Record<string, { name: string; description: string; monthlyAmount: number }> = {
    starter:  { name: "Blackglass Starter",  description: "15 hosts · 3 operator seats · drift detection · 4 scans/day",     monthlyAmount: 5900  },
    team:     { name: "Blackglass Team",     description: "25 hosts · 3 operator seats · hourly scans · full API",            monthlyAmount: 8900  },
    growth:   { name: "Blackglass Growth",   description: "100 hosts · 5 operator seats · fleet dashboard",                   monthlyAmount: 19900 },
    scale:    { name: "Blackglass Scale",    description: "200 hosts · 7 operator seats · host groups · approval workflows",  monthlyAmount: 34900 },
    business: { name: "Blackglass Business", description: "300 hosts · 10 operator seats · immutable audit · Remediator incl", monthlyAmount: 49900 },
  };

  const priceId = PLAN_PRICE_ENV[planCode][billingCycle];
  const fallback = PLAN_FALLBACK[planCode];
  const interval: "month" | "year" = billingCycle === "annual" ? "year" : "month";
  const amount = billingCycle === "annual" ? fallback.monthlyAmount * 10 : fallback.monthlyAmount;

  // Stripe types the union — keep it explicit so adding price_data fallbacks below
  // for add-ons keeps type-checking.
  type LineItem =
    | { price: string; quantity: number }
    | {
        price_data: {
          currency: string;
          product_data: { name: string; description: string; images: string[] };
          unit_amount: number;
          recurring: { interval: "month" | "year" };
        };
        quantity: number;
      };

  const lineItems: LineItem[] = priceId
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

  // Append add-on line items so the customer can buy Remediator at the
  // same time as their plan. Each add-on resolves an env var first
  // (real Stripe price), with a price_data fallback for fresh
  // deployments. Amounts mirror ADD_ONS in src/lib/saas/plans.ts.
  const ADDON_CONFIG = {
    remediator: {
      monthlyEnv: process.env.STRIPE_REMEDIATOR_PRICE_ID?.trim() || undefined,
      annualEnv: process.env.STRIPE_REMEDIATOR_ANNUAL_PRICE_ID?.trim() || undefined,
      name: "Blackglass Remediator (HITL AI)",
      description: "250 included remediation actions/month, $0.10 per extra",
      monthlyAmount: 9_900,
    },
    charon: {
      monthlyEnv: process.env.STRIPE_CHARON_PRICE_ID?.trim() || undefined,
      annualEnv: process.env.STRIPE_CHARON_ANNUAL_PRICE_ID?.trim() || undefined,
      name: "Blackglass Charon (cloud janitor)",
      description: "Linked cloud accounts + cleanup queue boosts; see docs for plan pairing",
      monthlyAmount: 4_900,
    },
  } as const;

  for (const addon of addons) {
    const cfg = ADDON_CONFIG[addon];
    const addonPriceId = billingCycle === "annual" ? cfg.annualEnv : cfg.monthlyEnv;
    if (addonPriceId) {
      lineItems.push({ price: addonPriceId, quantity: 1 });
    } else {
      const addonAmount =
        billingCycle === "annual" ? cfg.monthlyAmount * 10 : cfg.monthlyAmount;
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `${cfg.name}${billingCycle === "annual" ? " (annual)" : ""}`,
            description: cfg.description,
            images: [],
          },
          unit_amount: addonAmount,
          recurring: { interval },
        },
        quantity: 1,
      });
    }
  }

  let sessionMetadata: Record<string, string> = {
    plan: planCode,
    billing_cycle: billingCycle,
    source: "blackglass_checkout",
    // Comma-separated so the webhook can fan out add-on entitlements
    // (Remediator unlock) without re-parsing line items from Stripe.
    addons: addons.join(","),
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
