import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { tryGetDb } from "@/db";
import { applySaasSentryContext } from "@/lib/observability/sentry-saas";
import { hasPermission, type SaasPermission } from "@/lib/saas/permissions";
import type { TenantRole } from "@/lib/saas/tenant-role";
import { isTenantRole } from "@/lib/saas/tenant-role";
import {
  getMembership,
  getSubscriptionForTenant,
  ensureTenantForClerkOrg,
  upsertMembership,
} from "@/lib/saas/tenant-service";
import type { SaasSubscription, SaasTenant } from "@/db/schema";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";

export type TenantAuthContext = {
  userId: string;
  orgId: string;
  tenant: SaasTenant;
  role: TenantRole;
  subscription: SaasSubscription;
};

/**
 * Flat, strongly-typed context object passed to policy functions and route handlers.
 * Use `requireTenantContext()` to obtain one; it throws `SaasAuthError` on failure.
 */
export type SaasContext = {
  tenantId: string;
  userId: string;
  role: TenantRole;
  subscription: SaasSubscription;
  clerkOrgId: string;
};

export class SaasAuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "SaasAuthError";
  }
}

async function syncMembershipFromClerkOrg(
  userId: string,
  clerkOrgId: string,
  orgName: string,
): Promise<TenantRole | null> {
  const client = await clerkClient();
  const list = await client.users.getOrganizationMembershipList({ userId });
  const m = list.data.find((x: { organization: { id: string } }) => x.organization.id === clerkOrgId);
  if (!m) return null;
  const meta = m.publicMetadata as { app_role?: string };
  let role: TenantRole;
  if (typeof meta.app_role === "string" && isTenantRole(meta.app_role)) {
    role = meta.app_role;
  } else if (m.role === "org:admin") {
    role = "owner";
  } else {
    role = "viewer";
  }
  await upsertMembership({
    clerkOrgId,
    orgName,
    userId,
    role,
    invitedBy: null,
  });
  return role;
}

export async function requireTenantAuth(): Promise<TenantAuthContext> {
  if (!isClerkAuthEnabled()) {
    throw new SaasAuthError(501, "clerk_disabled", "Clerk SaaS auth is not configured.");
  }
  const { userId, orgId } = await auth();
  if (!userId) {
    throw new SaasAuthError(401, "unauthenticated", "Sign in required.");
  }
  if (!orgId) {
    throw new SaasAuthError(400, "no_organization", "Select or create an organization.");
  }
  if (!tryGetDb()) {
    throw new SaasAuthError(503, "database_unavailable", "DATABASE_URL is not configured.");
  }

  const user = await currentUser();
  if (process.env.CLERK_ENFORCE_APP_MFA === "true" && user && !user.twoFactorEnabled) {
    throw new SaasAuthError(403, "mfa_required", "Multi-factor authentication is required.");
  }

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({ organizationId: orgId });
  const tenant = await ensureTenantForClerkOrg(orgId, org.name ?? "Workspace");

  const subscription = await getSubscriptionForTenant(tenant.id);
  if (!subscription) {
    throw new SaasAuthError(500, "no_subscription", "Tenant has no subscription row.");
  }

  let membership = await getMembership(tenant.id, userId);
  if (!membership || membership.status !== "active") {
    await syncMembershipFromClerkOrg(userId, orgId, org.name ?? "Workspace");
    membership = await getMembership(tenant.id, userId);
  }
  if (!membership || membership.status !== "active") {
    throw new SaasAuthError(403, "not_member", "You are not a member of this workspace.");
  }

  const h = await headers();
  void applySaasSentryContext({
    tenantId: tenant.id,
    clerkOrgId: orgId,
    requestId: h.get("x-request-id") ?? undefined,
    userId,
    plan: subscription.planCode,
  });

  return {
    userId,
    orgId,
    tenant,
    role: membership.role,
    subscription,
  };
}

export async function requireTenantPermission(
  permission: SaasPermission,
): Promise<TenantAuthContext> {
  const ctx = await requireTenantAuth();
  if (!hasPermission(ctx.role, permission)) {
    throw new SaasAuthError(403, "forbidden", `Missing permission: ${permission}`);
  }
  return ctx;
}

/**
 * Step-up for sensitive mutations. Enable `CLERK_REQUIRE_STEP_UP=true` and add a numeric
 * `fva` (factor verification age — **seconds since last primary second-factor verification**)
 * claim via a Clerk JWT or session token template. Lower `fva` means fresher MFA.
 * Server rejects the request when `fva` is absent or greater than `maxAgeSeconds`.
 */
export async function requireRecentPrimaryVerification(maxAgeSeconds = 600): Promise<void> {
  if (process.env.CLERK_REQUIRE_STEP_UP !== "true") {
    return;
  }
  const { sessionClaims } = await auth();
  const fva = sessionClaims?.fva;
  if (typeof fva !== "number" || fva > maxAgeSeconds) {
    throw new SaasAuthError(
      403,
      "step_up_required",
      "Recent reverification required for this action.",
    );
  }
}

/**
 * Resolves the authenticated tenant context as a flat `SaasContext` object.
 * Throws `SaasAuthError` (401/403/503) if the caller is not authenticated,
 * not a member of an organization, or the database is unavailable.
 *
 * Prefer this over `requireTenantAuth()` in new code — the flat shape makes
 * policy functions, `ensure*` wrappers, and Sentry tagging straightforward.
 */
export async function requireTenantContext(): Promise<SaasContext> {
  const ctx = await requireTenantAuth();
  return {
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    role: ctx.role,
    subscription: ctx.subscription,
    clerkOrgId: ctx.orgId,
  };
}

/**
 * Throws `SaasAuthError(403)` if `ctx.role` does not hold `permission`.
 * Call after `requireTenantContext()` or `requireTenantAuth()` for fine-grained
 * per-action checks without writing inline `if (!hasPermission(...))` blocks.
 */
export function requirePermission(permission: SaasPermission, ctx: SaasContext): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new SaasAuthError(403, "forbidden", `Missing permission: ${permission}`);
  }
}
