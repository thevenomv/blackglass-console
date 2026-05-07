"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { EvidenceView } from "./EvidenceView";
import { EvidenceExportModal } from "./EvidenceExportModal";
import { CisControlsTab } from "./CisControlsTab";

type Tab = "bundles" | "controls";

// evidenceExport plan flag is checked server-side in the API;
// we also receive it as a prop from the server component for the upgrade gate.
//
// canEditCisMappings is resolved server-side in EvidencePage from the
// caller's role. The API also enforces settings.write — this prop only
// controls UI affordance visibility (so viewers don't see a form that 403s).
export function EvidenceBody({
  hasAccess,
  canEditCisMappings,
}: {
  hasAccess: boolean;
  canEditCisMappings: boolean;
}) {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [tab, setTab] = useState<Tab>("bundles");

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
          hasAccess && tab === "bundles" ? (
            <EvidenceExportModal onGenerated={() => setRefreshSignal((n) => n + 1)} />
          ) : undefined
        }
      />

      {hasAccess ? (
        <>
          <div className="flex gap-1 border-b border-border-subtle text-xs">
            {(["bundles", "controls"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 py-2 font-semibold uppercase tracking-wide transition-colors ${
                  tab === t
                    ? "border-accent-blue text-fg-primary"
                    : "border-transparent text-fg-muted hover:text-fg-primary"
                }`}
              >
                {t === "bundles" ? "Bundles" : "Controls (CIS)"}
              </button>
            ))}
          </div>
          {tab === "bundles" ? (
            <EvidenceView refreshSignal={refreshSignal} />
          ) : (
            <CisControlsTab canEdit={canEditCisMappings} />
          )}
        </>
      ) : (
        <UpgradePrompt
          feature="Evidence bundles require BLACKGLASS Team"
          description="Export tamper-evident audit packages containing baselines, drift findings, acknowledgements, and operator notes — accepted for SOC 2, post-incident review, and CAB submissions."
        />
      )}
    </div>
  );
}
