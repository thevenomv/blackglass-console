export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { EvidenceBody } from "./_components/EvidenceBody";
import { Skeleton } from "@/components/ui/Skeleton";
import { getLimits } from "@/lib/plan";
import { mockLatency } from "@/lib/mockLatency";
import { Suspense } from "react";

async function EvidencePageContent() {
  await mockLatency(100);
  const { evidenceExport } = getLimits();
  return <EvidenceBody hasAccess={evidenceExport} />;
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