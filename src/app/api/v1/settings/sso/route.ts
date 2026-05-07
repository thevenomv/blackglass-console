/**
 * GET /api/v1/settings/sso
 *
 * Returns the SAML SSO status for the current tenant's Clerk organization.
 * Surfaces:
 *   - whether any SAML connection is configured at all
 *   - per-connection name, identity provider, ACS URL, last activity
 *   - the Clerk-dashboard deep-link the operator needs to add new
 *     connections (we never proxy SAML config writes — Clerk's dashboard
 *     is the source of truth for IdP metadata + signing certs)
 *
 * SAML connections live on the Clerk Organization, not the BLACKGLASS
 * tenant — they are managed by the customer's IT admin via the Clerk
 * Enterprise dashboard. We only read them so we can show "SSO is on" and
 * make the audit trail meaningful.
 *
 * Requires `settings.write` (admin only). Returns 501 in legacy mode
 * (no Clerk) and 200 with `{ enabled: false }` when Clerk is on but the
 * org has no SAML connections.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";

interface SsoConnectionView {
  id: string;
  name: string;
  provider: string;
  domain: string | null;
  active: boolean;
  syncUserAttributes: boolean;
  acsUrl: string | null;
  spEntityId: string | null;
}

interface SsoStatusResponse {
  enabled: boolean;
  clerkOrgId: string;
  connections: SsoConnectionView[];
  /** Deep-link into Clerk's organization-level SSO config. */
  manageUrl: string;
  /** Optional override for orgs whose plan doesn't include SSO. */
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
      "SAML SSO requires SaaS mode (Clerk Enterprise).",
      requestId,
    );
  }

  const orgId = access.ctx.tenant.clerkOrgId;
  if (!orgId) {
    return NextResponse.json<SsoStatusResponse>({
      enabled: false,
      clerkOrgId: "",
      connections: [],
      manageUrl: "https://dashboard.clerk.com/",
      upgradeUrl: null,
    });
  }

  let connections: SsoConnectionView[] = [];
  try {
    const client = await clerkClient();
    // The Clerk Backend API exposes SAML connections at the organization
    // level; the SDK surface name varies by version. Cast through unknown
    // because @clerk/nextjs's TS surface doesn't always type the
    // organization-scoped SAML endpoint, and we don't want a hard
    // version coupling here.
    const orgClient = client.organizations as unknown as {
      getOrganizationSamlConnectionList?: (args: {
        organizationId: string;
      }) => Promise<{
        data?: Array<{
          id: string;
          name?: string;
          provider?: string;
          domain?: string;
          active?: boolean;
          sync_user_attributes?: boolean;
          acs_url?: string;
          sp_entity_id?: string;
        }>;
      }>;
    };
    if (typeof orgClient.getOrganizationSamlConnectionList === "function") {
      const list = await orgClient.getOrganizationSamlConnectionList({
        organizationId: orgId,
      });
      connections = (list.data ?? []).map((c) => ({
        id: c.id,
        name: c.name ?? "Untitled",
        provider: c.provider ?? "saml",
        domain: c.domain ?? null,
        active: Boolean(c.active),
        syncUserAttributes: Boolean(c.sync_user_attributes),
        acsUrl: c.acs_url ?? null,
        spEntityId: c.sp_entity_id ?? null,
      }));
    }
  } catch (err) {
    // Most often a 403 (org plan doesn't include SSO) or 404 (the
    // endpoint is gated on Enterprise). Don't leak the upstream error
    // shape — surface a clean disabled state instead.
    console.warn(
      `[settings/sso] Clerk SSO list failed for org ${orgId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const manageUrl = `https://dashboard.clerk.com/apps/`;
  const upgradeUrl = connections.length === 0 ? "https://clerk.com/pricing" : null;

  return NextResponse.json<SsoStatusResponse>({
    enabled: connections.some((c) => c.active),
    clerkOrgId: orgId,
    connections,
    manageUrl,
    upgradeUrl,
  });
}
