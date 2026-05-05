"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { EvidenceView } from "./EvidenceView";
import { EvidenceExportModal } from "./EvidenceExportModal";

// evidenceExport plan flag is checked server-side in the API;
// we also receive it as a prop from the server component for the upgrade gate.
export function EvidenceBody({ hasAccess }: { hasAccess: boolean }) {
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <div className="flex flex-col gap-6 px-6 pb-12 pt-6">
      <PageHeader
        title="Evidence"
        subtitle="Tamper-aware bundles for audits, regulated workflows, and incident review."
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/evidence", label: "Evidence" },
        ]}
        actions={
          hasAccess ? (
            <EvidenceExportModal onGenerated={() => setRefreshSignal((n) => n + 1)} />
          ) : undefined
        }
      />

      {hasAccess ? (
        <EvidenceView refreshSignal={refreshSignal} />
      ) : (
        <UpgradePrompt
          feature="Evidence bundles require BLACKGLASS Team"
          description="Export tamper-evident audit packages containing baselines, drift findings, acknowledgements, and operator notes — accepted for SOC 2, post-incident review, and CAB submissions."
        />
      )}
    </div>
  );
}
