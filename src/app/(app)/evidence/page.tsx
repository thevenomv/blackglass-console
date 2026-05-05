export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { EvidenceView } from "./_components/EvidenceView";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { getLimits } from "@/lib/plan";
import { mockLatency } from "@/lib/mockLatency";
import { Suspense } from "react";

async function EvidenceBody() {
  await mockLatency(200);
  const limits = getLimits();
  return (
    <div className="flex flex-col gap-6 px-6 pb-12 pt-6">
      <PageHeader
        title="Evidence"
        subtitle="Tamper-aware bundles for audits, regulated workflows, and incident review."
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/evidence", label: "Evidence" },
        ]}
      />

      {limits.evidenceExport ? (
        <EvidenceView />
      ) : (
        <UpgradePrompt
          feature="Evidence bundles require BLACKGLASS Team"
          description="Export tamper-evident audit packages containing baselines, drift findings, acknowledgements, and operator notes — accepted for SOC 2, post-incident review, and CAB submissions."
        />
      )}
    </div>
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
        <EvidenceBody />
      </Suspense>
    </AppShell>
  );
}
