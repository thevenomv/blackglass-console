export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireTenantAuth, SaasAuthError } from "@/lib/saas/auth-context";
import { hasPermission } from "@/lib/saas/permissions";
import type { TenantRole } from "@/lib/saas/tenant-role";
import { AuditLogView } from "./_components/AuditLogView";

async function loadRole(): Promise<{ role: TenantRole | null; redirectTo?: string }> {
  if (!isClerkAuthEnabled()) return { role: null, redirectTo: "/settings" };
  try {
    const ctx = await requireTenantAuth();
    return { role: ctx.role };
  } catch (e) {
    if (e instanceof SaasAuthError && e.status === 400) {
      return { role: null, redirectTo: "/select-workspace" };
    }
    return { role: null, redirectTo: "/sign-in" };
  }
}

export default async function AuditPage() {
  const { role, redirectTo } = await loadRole();
  if (redirectTo) redirect(redirectTo);
  const allowed = role !== null && hasPermission(role, "evidence.view");

  return (
    <AppShell>
      <div className="flex max-w-5xl flex-col gap-6 px-6 pb-12 pt-6">
        <PageHeader
          title="Audit log"
          subtitle="Searchable, tenant-scoped record of every action that touched this workspace."
        />
        {allowed ? (
          <>
            <p className="text-xs text-fg-faint">Signed in as {role}.</p>
            <AuditLogView />
          </>
        ) : (
          <div className="px-1 py-12 text-sm text-fg-muted">
            You do not have access to the audit log.
          </div>
        )}
      </div>
    </AppShell>
  );
}
