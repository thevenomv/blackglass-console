/**
 * GET /api/v1/settings/scim
 *
 * Returns the SCIM 2.0 provisioning status for the current tenant's
 * Clerk organization. As with SSO, BLACKGLASS doesn't run its own
 * SCIM endpoint — Clerk Enterprise exposes one per organization and
 * the customer's IdP (Okta, Azure AD, JumpCloud, OneLogin, etc.)
 * pushes user + group lifecycle events to it.
 *
 * This endpoint surfaces:
 *   - whether SCIM is configured at all (does the org have a SCIM
 *     bearer token issued?)
 *   - the SCIM base URL the customer needs to give to their IdP
 *   - the bearer-token rotation cadence we recommend (90 days)
 *   - a deep-link to the Clerk dashboard SCIM page
 *
 * We never echo the bearer token itself; rotation lives in the
 * Clerk dashboard.
 *
 * Requires `settings.write` (admin only). Returns 501 in legacy
 * mode (no Clerk).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";

interface ScimStatusResponse {
  enabled: boolean;
  clerkOrgId: string;
  /**
   * Base URL the customer's IdP POSTs to. Clerk's SCIM endpoint is
   * `https://api.clerk.com/v1/scim/{org_id}` with bearer-token auth.
   */
  scimBaseUrl: string;
  /** Recommendation surfaced in the UI; not enforced. */
  recommendedRotationDays: number;
  /** Deep-link to the Clerk dashboard's organization-scoped SCIM page. */
  manageUrl: string;
  /** Optional upgrade link when the org plan doesn't include SCIM. */
  upgradeUrl: string | null;
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(
      501,
      "not_supported",
      "SCIM 2.0 provisioning requires SaaS mode (Clerk Enterprise).",
      requestId,
    );
  }

  const orgId = access.ctx.tenant.clerkOrgId;
  if (!orgId) {
    return NextResponse.json<ScimStatusResponse>({
      enabled: false,
      clerkOrgId: "",
      scimBaseUrl: "",
      recommendedRotationDays: 90,
      manageUrl: "https://dashboard.clerk.com/",
      upgradeUrl: null,
    });
  }

  // Probe whether the org has SCIM tokens issued. Clerk's API surface
  // is plan-gated; not every workspace has the SCIM endpoints, so we
  // detect the existence rather than failing the whole route. The
  // exact endpoint is documented in Clerk's Backend API but the SDK's
  // typed surface lags — we cast through unknown to stay decoupled.
  let enabled = false;
  try {
    const client = await clerkClient();
    const orgClient = client.organizations as unknown as {
      getOrganizationScimTokenList?: (args: {
        organizationId: string;
      }) => Promise<{ data?: Array<{ id: string }> }>;
    };
    if (typeof orgClient.getOrganizationScimTokenList === "function") {
      const list = await orgClient.getOrganizationScimTokenList({
        organizationId: orgId,
      });
      enabled = (list.data ?? []).length > 0;
    }
  } catch (err) {
    // Most often a 403 (plan doesn't include SCIM) or 404 (endpoint
    // gated). Don't surface the upstream error shape — return a
    // clean disabled state instead so the UI can offer the upgrade
    // link.
    console.warn(
      `[settings/scim] Clerk SCIM probe failed for org ${orgId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return NextResponse.json<ScimStatusResponse>({
    enabled,
    clerkOrgId: orgId,
    scimBaseUrl: `https://api.clerk.com/v1/scim/${orgId}`,
    recommendedRotationDays: 90,
    manageUrl: "https://dashboard.clerk.com/",
    upgradeUrl: enabled ? null : "https://clerk.com/pricing",
  });
}
