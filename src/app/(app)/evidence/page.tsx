export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { EvidenceExportModal } from "./_components/EvidenceExportModal";
import { EvidenceView } from "./_components/EvidenceView";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { mockLatency } from "@/lib/mockLatency";
import { Suspense } from "react";

async function EvidenceBody() {
  await mockLatency(200);
  return (
    <div className="flex flex-col gap-6 px-6 pb-12 pt-6">
      <PageHeader
        title="Evidence"
        subtitle="Tamper-aware bundles for audits, regulated workflows, and incident review."
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/evidence", label: "Evidence" },
        ]}
        actions={<EvidenceExportModal />}
      />

      <EvidenceView />

      <div className="rounded-card border border-border-subtle bg-bg-panel/60 px-4 py-3 text-sm text-fg-muted">
        Bundles contain structured findings plus optional narrative summaries — configure retention and signing
        policies before enabling automated exports.
      </div>
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
