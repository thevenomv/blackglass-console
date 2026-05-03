import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { checkPortalRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { z } from "zod";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireTenantAuth, SaasAuthError, requireRecentPrimaryVerification } from "@/lib/saas/auth-context";
import { hasPermission } from "@/lib/saas/permissions";
import { canChangeBillingForTenant } from "@/lib/saas/operations";

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
 */
export async function POST(request: Request) {
  if (!(await checkPortalRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many portal requests. Please wait before trying again.");
  }

  const origin =
    request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000";

  let customerId: string;
  try {
    const body = await request.json();
    const parsed = PortalBodySchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    customerId = parsed.data.customerId;
  } catch {
    return jsonError(400, "invalid_json", "Invalid JSON body");
  }

  if (isClerkAuthEnabled()) {
    try {
      if (process.env.CLERK_REQUIRE_STEP_UP === "true") {
        await requireRecentPrimaryVerification();
      }
      const ctx = await requireTenantAuth();
      if (!hasPermission(ctx.role, "billing.manage")) {
        return jsonError(403, "forbidden", "Missing billing.manage permission.");
      }
      const gate = canChangeBillingForTenant(ctx.role, ctx.subscription);
      if (!gate.ok) {
        return jsonError(403, gate.code, gate.detail);
      }
      const expected = ctx.subscription.stripeCustomerId?.trim();
      if (expected && expected !== customerId) {
        return jsonError(403, "customer_mismatch", "Stripe customer does not match this workspace.");
      }
    } catch (e) {
      if (e instanceof SaasAuthError) {
        return jsonError(e.status, e.code, e.message);
      }
      throw e;
    }
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
