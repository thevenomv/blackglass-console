export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { EvidenceBody } from "./_components/EvidenceBody";
import { Skeleton } from "@/components/ui/Skeleton";
import { getLimits } from "@/lib/plan";
import { mockLatency } from "@/lib/mockLatency";
import { Suspense } from "react";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireTenantAuth, SaasAuthError } from "@/lib/saas/auth-context";
import { hasPermission } from "@/lib/saas/permissions";

/**
 * Resolve whether the signed-in viewer can edit CIS-control mappings.
 *
 * - Legacy / single-tenant mode (no Clerk): default to true so the
 *   single operator keeps full control without an auth dance.
 * - Clerk SaaS mode: gated by `settings.write` (owner + admin), matching
 *   the API gate at `/api/v1/evidence/cis-mappings`. Auth failures fall
 *   back to read-only so guests/auditors don't see a form that 403s on
 *   submit.
 */
async function resolveCanEditCisMappings(): Promise<boolean> {
  if (!isClerkAuthEnabled()) return true;
  try {
    const ctx = await requireTenantAuth();
    return hasPermission(ctx.role, "settings.write");
  } catch (e) {
    if (e instanceof SaasAuthError) return false;
    return false;
  }
}

async function EvidencePageContent() {
  await mockLatency(100);
  const { evidenceExport } = getLimits();
  const canEditCisMappings = await resolveCanEditCisMappings();
  return (
    <EvidenceBody
      hasAccess={evidenceExport}
      canEditCisMappings={canEditCisMappings}
    />
  );
}

function EvidenceFallback() {
  return (
    <div className="space-y-4 px-6 py-6">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

export default function EvidencePage() {
  return (
    <AppShell>
      <Suspense fallback={<EvidenceFallback />}>
        <EvidencePageContent />
      </Suspense>
    </AppShell>
  );
}