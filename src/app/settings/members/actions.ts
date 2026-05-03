"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  requireTenantAuth,
  requireRecentPrimaryVerification,
  SaasAuthError,
} from "@/lib/saas/auth-context";
import { hasPermission, canAssignRole } from "@/lib/saas/permissions";
import { canAddPaidSeat, getSeatUsage, canApplyRoleChange } from "@/lib/saas/seats";
import { listMembershipsForTenant, upsertMembership } from "@/lib/saas/tenant-service";
import type { TenantRole } from "@/lib/saas/tenant-role";
import { isTenantRole } from "@/lib/saas/tenant-role";
import { soleOwnerDemotionBlocked } from "@/lib/saas/member-guards";
import { emitSaasAudit, emitSaasSecurity } from "@/lib/saas/event-log";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { checkSaasMemberInviteRate, clientIpFromHeaders } from "@/lib/server/rate-limit";

function canInviteMembers(role: TenantRole): boolean {
  return hasPermission(role, "members.invite_non_owner") || hasPermission(role, "members.manage");
}

export type UpdateMemberRoleResult = { ok: true } | { ok: false; message: string };

export async function updateMemberRoleAction(
  targetUserId: string,
  role: string,
): Promise<UpdateMemberRoleResult> {
  if (!isClerkAuthEnabled()) {
    return { ok: false, message: "Clerk is not enabled." };
  }
  if (!targetUserId.trim()) {
    return { ok: false, message: "User id required." };
  }
  if (!isTenantRole(role)) {
    return { ok: false, message: "Invalid role." };
  }
  const newRole = role;

  if (process.env.CLERK_ENFORCE_INVITE_STEP_UP === "true") {
    try {
      await requireRecentPrimaryVerification();
    } catch (e) {
      const msg = e instanceof SaasAuthError ? e.message : "Verification required.";
      return { ok: false, message: msg };
    }
  }

  let ctx;
  try {
    ctx = await requireTenantAuth();
  } catch (e) {
    const msg = e instanceof SaasAuthError ? e.message : "Unauthorized.";
    return { ok: false, message: msg };
  }

  if (
    !hasPermission(ctx.role, "roles.assign_all") &&
    !hasPermission(ctx.role, "roles.assign_non_owner")
  ) {
    return { ok: false, message: "You cannot change member roles." };
  }
  if (!canAssignRole(ctx.role, newRole)) {
    return { ok: false, message: "You cannot assign that role." };
  }

  const memberships = await listMembershipsForTenant(ctx.tenant.id);
  if (soleOwnerDemotionBlocked(memberships, targetUserId, newRole)) {
    return { ok: false, message: "Cannot demote the only workspace owner." };
  }

  const seat = canApplyRoleChange(memberships, targetUserId, newRole, ctx.subscription.paidSeatLimit);
  if (!seat.ok) {
    return {
      ok: false,
      message: "Paid seat limit reached — upgrade or free a seat before promoting this member.",
    };
  }

  const client = await clerkClient();
  const clerkMembershipRole = newRole === "owner" ? "org:admin" : "org:member";
  try {
    // Clerk membership `publicMetadata` maps to app_role sync (see Clerk REST `public_metadata`).
    await client.organizations.updateOrganizationMembership({
      organizationId: ctx.orgId,
      userId: targetUserId,
      role: clerkMembershipRole,
      publicMetadata: { app_role: newRole },
    } as Parameters<typeof client.organizations.updateOrganizationMembership>[0]);
  } catch (e) {
    console.error("[member-role]", e);
    return { ok: false, message: "Clerk could not update membership." };
  }

  await upsertMembership({
    clerkOrgId: ctx.orgId,
    orgName: ctx.tenant.name,
    userId: targetUserId,
    role: newRole,
    invitedBy: ctx.userId,
  });

  await emitSaasAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "member.role_changed",
    targetType: "user",
    targetId: targetUserId,
    metadata: { role: newRole },
  });
  revalidatePath("/settings/members");
  return { ok: true };
}

export type InviteMemberResult =
  | { ok: true }
  | { ok: false; message: string };

export async function inviteMemberAction(email: string, role: string): Promise<InviteMemberResult> {
  if (!isClerkAuthEnabled()) {
    return { ok: false, message: "Clerk is not enabled." };
  }
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) {
    return { ok: false, message: "Valid email required." };
  }
  if (!isTenantRole(role)) {
    return { ok: false, message: "Invalid role." };
  }
  const targetRole = role;

  if (process.env.CLERK_ENFORCE_INVITE_STEP_UP === "true") {
    try {
      await requireRecentPrimaryVerification();
    } catch (e) {
      const msg = e instanceof SaasAuthError ? e.message : "Verification required.";
      return { ok: false, message: msg };
    }
  }

  let ctx;
  try {
    ctx = await requireTenantAuth();
  } catch (e) {
    const msg = e instanceof SaasAuthError ? e.message : "Unauthorized.";
    return { ok: false, message: msg };
  }

  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  if (!(await checkSaasMemberInviteRate(ip))) {
    await emitSaasSecurity({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      severity: "medium",
      eventType: "invite_rate_limited",
      ip,
      metadata: {},
    });
    return { ok: false, message: "Too many invites — wait a minute and try again." };
  }

  if (!canInviteMembers(ctx.role)) {
    return { ok: false, message: "You cannot invite members." };
  }
  if (!canAssignRole(ctx.role, targetRole)) {
    return { ok: false, message: "You cannot assign that role." };
  }

  const memberships = await listMembershipsForTenant(ctx.tenant.id);
  const seat = canAddPaidSeat(memberships, ctx.subscription.paidSeatLimit, targetRole);
  if (!seat.ok) {
    await emitSaasSecurity({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      severity: "medium",
      eventType: "paid_seat_invite_blocked",
      metadata: { targetRole, email: trimmed },
    });
    return {
      ok: false,
      message:
        "Paid seat limit reached — upgrade or remove an operator/admin/owner before adding more. You can still invite unlimited viewers.",
    };
  }

  const client = await clerkClient();
  try {
    await client.organizations.createOrganizationInvitation({
      organizationId: ctx.orgId,
      emailAddress: trimmed,
      role: "org:member",
      inviterUserId: ctx.userId,
      publicMetadata: { app_role: targetRole },
    });
  } catch (e) {
    console.error("[invite]", e);
    await emitSaasSecurity({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      severity: "medium",
      eventType: "invite_clerk_failed",
      metadata: { email: trimmed },
    });
    return { ok: false, message: "Clerk could not create invitation (rate limit or duplicate)." };
  }

  await emitSaasAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "member.invited",
    targetType: "email",
    targetId: trimmed,
    metadata: { role: targetRole },
  });
  revalidatePath("/settings/members");
  return { ok: true };
}

export async function getMemberInviteContextAction(): Promise<
  | { ok: false; message: string }
  | {
      ok: true;
      seatUsage: ReturnType<typeof getSeatUsage>;
      roles: { value: TenantRole; label: string; paidSeat: boolean }[];
    }
> {
  if (!isClerkAuthEnabled()) {
    return { ok: false, message: "Clerk not enabled." };
  }
  try {
    const ctx = await requireTenantAuth();
    if (!canInviteMembers(ctx.role)) {
      return { ok: false, message: "Forbidden." };
    }
    const memberships = await listMembershipsForTenant(ctx.tenant.id);
    const seatUsage = getSeatUsage(memberships, ctx.subscription.paidSeatLimit);
    const ROLE_OPTIONS = [
      { value: "owner" as const, label: "Owner", paidSeat: true },
      { value: "admin" as const, label: "Admin", paidSeat: true },
      { value: "operator" as const, label: "Operator", paidSeat: true },
      { value: "viewer" as const, label: "Viewer (no seat charge)", paidSeat: false },
      {
        value: "guest_auditor" as const,
        label: "Guest auditor (no seat charge)",
        paidSeat: false,
      },
    ];
    const roles = ROLE_OPTIONS.filter((r) => canAssignRole(ctx.role, r.value));
    return { ok: true, seatUsage, roles };
  } catch (e) {
    const msg = e instanceof SaasAuthError ? e.message : "Unauthorized.";
    return { ok: false, message: msg };
  }
}
