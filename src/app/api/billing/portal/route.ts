/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Customer Portal session for the calling tenant — the UI
 * doesn't need to know the Stripe customer id, this resolves it from the
 * subscription row.  Returns `{ url }` for the client to navigate to.
 *
 * Use this in the Settings → Billing pane.  The legacy /api/checkout/portal
 * endpoint still exists for paths that already pass an explicit customerId.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import {
  requireTenantAuth,
  SaasAuthError,
  requireRecentPrimaryVerification,
} from "@/lib/saas/auth-context";
import { hasPermission } from "@/lib/saas/permissions";
import { canChangeBillingForTenant } from "@/lib/saas/operations";
import { checkPortalRate, clientIp } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkPortalRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many portal requests. Please wait.", requestId);
  }
  if (!isClerkAuthEnabled()) {
    return jsonError(400, "not_supported", "Billing portal requires SaaS mode.", requestId);
  }

  try {
    if (process.env.CLERK_REQUIRE_STEP_UP === "true") {
      await requireRecentPrimaryVerification();
    }
    const ctx = await requireTenantAuth();
    if (!hasPermission(ctx.role, "billing.manage")) {
      return jsonError(403, "forbidden", "Missing billing.manage permission.", requestId);
    }
    const gate = canChangeBillingForTenant(ctx.role, ctx.subscription);
    if (!gate.ok) {
      return jsonError(403, gate.code, gate.detail, requestId);
    }
    const customerId = ctx.subscription.stripeCustomerId?.trim();
    if (!customerId) {
      return jsonError(
        409,
        "no_stripe_customer",
        "This workspace has no Stripe customer yet — start a checkout first.",
        requestId,
      );
    }

    const origin =
      request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    if (e instanceof SaasAuthError) {
      return jsonError(e.status, e.code, e.message, requestId);
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[billing/portal] Failed to create portal session:", message);
    return jsonError(502, "stripe_portal_error", "Could not create billing portal session", requestId);
  }
}
