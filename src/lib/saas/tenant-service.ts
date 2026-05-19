import { and, eq } from "drizzle-orm";
import {
  withBypassRls,
  withTenantRls,
  type BlackglassDb,
  schema,
} from "@/db";
import type { TenantRole } from "@/lib/saas/tenant-role";
import { isTenantRole } from "@/lib/saas/tenant-role";
import { applyEnterpriseSubscriptionGrant } from "@/lib/saas/enterprise-grant";
import { TRIAL_DAYS, TRIAL_HOST_LIMIT, TRIAL_PAID_SEAT_LIMIT } from "@/lib/saas/plans";
import { isTrialReadOnlyState } from "@/lib/saas/trial";

const { saasTenants, saasSubscriptions, saasTenantMemberships } = schema;
async function ensureTenantForClerkOrgWithDb(db: BlackglassDb, clerkOrgId: string, orgName: string) {
  const existing = await db
    .select()
    .from(saasTenants)
    .where(eq(saasTenants.clerkOrgId, clerkOrgId))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(saasTenants)
    .values({ clerkOrgId, name: orgName })
    .returning();
  const tenant = inserted[0];
  if (!tenant) {
    throw new Error("saas_tenants insert returned no rows");
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000);
  await db.insert(saasSubscriptions).values({
    tenantId: tenant.id,
    planCode: "trial",
    status: "trialing",
    trialEndsAt,
    currentPeriodEndsAt: null,
    hostLimit: TRIAL_HOST_LIMIT,
    paidSeatLimit: TRIAL_PAID_SEAT_LIMIT,
    features: {},
  });
  return tenant;
}

export async function ensureTenantForClerkOrg(clerkOrgId: string, orgName: string) {
  // RLS-BYPASS: Clerk webhook / first-login bootstrap creates the tenant
  // row itself (no tenantId yet to scope to).
  return withBypassRls((db) => ensureTenantForClerkOrgWithDb(db, clerkOrgId, orgName));
}

export function parseMembershipRole(metadata: unknown): TenantRole {
  if (!metadata || typeof metadata !== "object") return "viewer";
  const raw = (metadata as Record<string, unknown>).app_role;
  if (typeof raw === "string" && isTenantRole(raw)) return raw;
  return "viewer";
}

export async function upsertMembership(input: {
  clerkOrgId: string;
  orgName: string;
  userId: string;
  role: TenantRole;
  invitedBy?: string | null;
}) {
  // RLS-BYPASS: Clerk organizationMembership.* webhook handler. Creates or
  // updates the SaaS membership row; tenant id is derived from the verified
  // Clerk org id in the same transaction.
  return withBypassRls(async (db) => {
    const tenant = await ensureTenantForClerkOrgWithDb(db, input.clerkOrgId, input.orgName);
    await db
      .insert(saasTenantMemberships)
      .values({
        tenantId: tenant.id,
        userId: input.userId,
        role: input.role,
        status: "active",
        invitedBy: input.invitedBy ?? null,
      })
      .onConflictDoUpdate({
        target: [saasTenantMemberships.tenantId, saasTenantMemberships.userId],
        set: {
          role: input.role,
          status: "active",
          invitedBy: input.invitedBy ?? null,
        },
      });
    return tenant.id;
  });
}

export async function deleteMembership(clerkOrgId: string, userId: string) {
  // RLS-BYPASS: Clerk organizationMembership.deleted webhook; resolves the
  // verified Clerk org id to the SaaS tenant id, then drops the membership.
  return withBypassRls(async (db) => {
    const tenantRows = await db
      .select({ id: saasTenants.id })
      .from(saasTenants)
      .where(eq(saasTenants.clerkOrgId, clerkOrgId))
      .limit(1);
    const tenantId = tenantRows[0]?.id;
    if (!tenantId) return;
    await db
      .delete(saasTenantMemberships)
      .where(
        and(eq(saasTenantMemberships.tenantId, tenantId), eq(saasTenantMemberships.userId, userId)),
      );
  });
}

export async function getTenantRowByClerkOrg(clerkOrgId: string) {
  // RLS-BYPASS: lookup-only; resolves Clerk org id (from a verified session
  // or webhook) to the saas_tenants row that backs it.
  return withBypassRls((db) =>
    db.select().from(saasTenants).where(eq(saasTenants.clerkOrgId, clerkOrgId)).limit(1),
  );
}

/**
 * Auto-provision a trial subscription for an existing tenant that somehow has no subscription
 * row (e.g. created before auto-provisioning, or webhook delivery failed).
 */
export async function ensureSubscriptionForTenant(tenantId: string) {
  // RLS-BYPASS: subscription-row backfill for a tenant that somehow has no
  // saas_subscriptions row yet (early-bird tenants from before
  // auto-provision, or a missed Clerk webhook delivery). Idempotent.
  return withBypassRls(async (db) => {
    const existing = await db
      .select()
      .from(saasSubscriptions)
      .where(eq(saasSubscriptions.tenantId, tenantId))
      .limit(1);
    if (existing[0]) return existing[0];
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000);
    const insertedSubs = await db
      .insert(saasSubscriptions)
      .values({
        tenantId,
        planCode: "trial",
        status: "trialing",
        trialEndsAt,
        currentPeriodEndsAt: null,
        hostLimit: TRIAL_HOST_LIMIT,
        paidSeatLimit: TRIAL_PAID_SEAT_LIMIT,
        features: {},
      })
      .returning();
    const sub = insertedSubs[0];
    if (!sub) {
      throw new Error("saas_subscriptions insert returned no rows");
    }
    return sub;
  });
}

export type GetSubscriptionForTenantOptions = {
  /** When set (e.g. from Clerk), merged with env + internal enterprise grant lists. */
  grantUserEmails?: readonly string[];
};

export async function getSubscriptionForTenant(
  tenantId: string,
  options?: GetSubscriptionForTenantOptions,
) {
  return withTenantRls(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(saasSubscriptions)
      .where(eq(saasSubscriptions.tenantId, tenantId))
      .limit(1);
    let sub = rows[0];
    if (!sub) return null;
    /* Lazy transition trialing → trial_expired */
    if (isTrialReadOnlyState(sub)) {
      if (sub.status !== "trial_expired") {
        await db
          .update(saasSubscriptions)
          .set({ status: "trial_expired", updatedAt: new Date() })
          .where(eq(saasSubscriptions.id, sub.id));
        sub = { ...sub, status: "trial_expired" };
      }
    }
    return applyEnterpriseSubscriptionGrant(sub, tenantId, options?.grantUserEmails);
  });
}

export async function listMembershipsForTenant(tenantId: string) {
  return withTenantRls(tenantId, (db) =>
    db.select().from(saasTenantMemberships).where(eq(saasTenantMemberships.tenantId, tenantId)),
  );
}

export async function getMembership(tenantId: string, userId: string) {
  return withTenantRls(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(saasTenantMemberships)
      .where(
        and(
          eq(saasTenantMemberships.tenantId, tenantId),
          eq(saasTenantMemberships.userId, userId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  });
}

/**
 * Cancel a tenant's subscription when the Clerk organization is deleted.
 * Deactivates all memberships and marks the subscription as "canceled".
 * The tenant row and audit history are preserved for compliance.
 *
 * Returns the Stripe subscription ID (if any) so the caller can cancel it
 * via the Stripe API before this function clears the local Stripe fields
 * (BILL-07).
 */
export async function cancelTenantByClerkOrg(
  clerkOrgId: string,
): Promise<{ stripeSubscriptionId: string | null }> {
  // RLS-BYPASS: Clerk organization.deleted webhook; cancels the tenant
  // subscription and deactivates memberships in one transaction.
  return withBypassRls(async (db) => {
    const tenantRows = await db
      .select({ id: saasTenants.id })
      .from(saasTenants)
      .where(eq(saasTenants.clerkOrgId, clerkOrgId))
      .limit(1);
    const tenantId = tenantRows[0]?.id;
    if (!tenantId) return { stripeSubscriptionId: null };

    // Fetch the Stripe subscription ID before clearing it so the caller
    // can cancel it via the Stripe API.
    const subRows = await db
      .select({
        stripeSubscriptionId: saasSubscriptions.stripeSubscriptionId,
      })
      .from(saasSubscriptions)
      .where(eq(saasSubscriptions.tenantId, tenantId))
      .limit(1);
    const stripeSubscriptionId = subRows[0]?.stripeSubscriptionId ?? null;

    await db
      .update(saasSubscriptions)
      .set({
        status: "canceled",
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        updatedAt: new Date(),
      })
      .where(eq(saasSubscriptions.tenantId, tenantId));
    await db
      .update(saasTenantMemberships)
      .set({ status: "deactivated" })
      .where(eq(saasTenantMemberships.tenantId, tenantId));

    return { stripeSubscriptionId };
  });
}

/**
 * Remove all memberships for a deleted Clerk user across all tenants.
 * Called when a `user.deleted` event is received from Clerk.
 */
export async function deleteAllMembershipsForUser(userId: string): Promise<void> {
  // RLS-BYPASS: Clerk user.deleted webhook is intentionally cross-tenant —
  // a deleted user must lose every membership in one shot.
  return withBypassRls(async (db) => {
    await db
      .delete(saasTenantMemberships)
      .where(eq(saasTenantMemberships.userId, userId));
  });
}
