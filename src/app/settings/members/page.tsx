import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireTenantAuth, SaasAuthError } from "@/lib/saas/auth-context";
import { listMembershipsForTenant } from "@/lib/saas/tenant-service";
import { hasPermission, canAssignRole } from "@/lib/saas/permissions";
import { TENANT_ROLES } from "@/lib/saas/tenant-role";
import { MembersView } from "./MembersView";
import type { TenantRole } from "@/lib/saas/tenant-role";

export default async function MembersSettingsPage() {
  if (!isClerkAuthEnabled()) {
    redirect("/settings");
  }
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  let ctx;
  try {
    ctx = await requireTenantAuth();
  } catch (e) {
    if (e instanceof SaasAuthError && e.status === 400) {
      redirect("/select-workspace");
    }
    redirect("/sign-in");
  }

  const rows = await listMembershipsForTenant(ctx.tenant.id);
  const canInvite =
    hasPermission(ctx.role, "members.invite_non_owner") ||
    hasPermission(ctx.role, "members.manage");

  const canReassignRoles =
    hasPermission(ctx.role, "roles.assign_all") || hasPermission(ctx.role, "roles.assign_non_owner");
  const assignableRoles = TENANT_ROLES.filter((role) => canAssignRole(ctx.role, role));

  const client = await clerkClient();
  const enriched = await Promise.all(
    rows.map(async (r) => {
      let mfaEnabled: boolean | null = null;
      let displayName: string | null = null;
      let primaryEmail: string | null = null;
      try {
        const u = await client.users.getUser(r.userId);
        mfaEnabled = u.twoFactorEnabled;
        displayName =
          [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
          u.username ||
          null;
        primaryEmail = u.primaryEmailAddress?.emailAddress ?? null;
      } catch {
        mfaEnabled = null;
        displayName = null;
        primaryEmail = null;
      }
      return {
        userId: r.userId,
        role: r.role as TenantRole,
        status: r.status,
        joinedAt: r.joinedAt.toISOString(),
        mfaEnabled,
        displayName,
        primaryEmail,
      };
    }),
  );

  return (
    <AppShell>
      <div className="flex max-w-3xl flex-col gap-8 px-6 pb-12 pt-6">
        <PageHeader
          title="Members"
          subtitle="Workspace membership, roles, and paid-seat usage. Server-side RBAC is enforced on every mutation."
        />
        <MembersView
          rows={enriched}
          canInvite={canInvite}
          canReassignRoles={canReassignRoles}
          assignableRoles={assignableRoles}
          currentUserId={userId}
        />
      </div>
    </AppShell>
  );
}
