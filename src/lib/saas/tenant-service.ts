import { and, eq } from "drizzle-orm";
import {
  withBypassRls,
  withTenantRls,
  type BlackglassDb,
  schema,
} from "@/db";
import type { TenantRole } from "@/lib/saas/tenant-role";
import { isTenantRole } from "@/lib/saas/tenant-role";
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

  const [tenant] = await db
    .insert(saasTenants)
    .values({ clerkOrgId, name: orgName })
    .returning();

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
  return withBypassRls((db) =>
    db.select().from(saasTenants).where(eq(saasTenants.clerkOrgId, clerkOrgId)).limit(1),
  );
}

/**
 * Auto-provision a trial subscription for an existing tenant that somehow has no subscription
 * row (e.g. created before auto-provisioning, or webhook delivery failed).
 */
export async function ensureSubscriptionForTenant(tenantId: string) {
  return withBypassRls(async (db) => {
    const existing = await db
      .select()
      .from(saasSubscriptions)
      .where(eq(saasSubscriptions.tenantId, tenantId))
      .limit(1);
    if (existing[0]) return existing[0];
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000);
    const [sub] = await db
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
    return sub;
  });
}

export async function getSubscriptionForTenant(tenantId: string) {
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
    return sub;
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
 */
export async function cancelTenantByClerkOrg(clerkOrgId: string): Promise<void> {
  return withBypassRls(async (db) => {
    const tenantRows = await db
      .select({ id: saasTenants.id })
      .from(saasTenants)
      .where(eq(saasTenants.clerkOrgId, clerkOrgId))
      .limit(1);
    const tenantId = tenantRows[0]?.id;
    if (!tenantId) return;
    await db
      .update(saasSubscriptions)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(saasSubscriptions.tenantId, tenantId));
    await db
      .update(saasTenantMemberships)
      .set({ status: "deactivated" })
      .where(eq(saasTenantMemberships.tenantId, tenantId));
  });
}

/**
 * Remove all memberships for a deleted Clerk user across all tenants.
 * Called when a `user.deleted` event is received from Clerk.
 */
export async function deleteAllMembershipsForUser(userId: string): Promise<void> {
  return withBypassRls(async (db) => {
    await db
      .delete(saasTenantMemberships)
      .where(eq(saasTenantMemberships.userId, userId));
  });
}
