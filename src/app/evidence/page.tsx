import { AppShell } from "@/components/layout/AppShell";
import { EvidenceExportModal } from "@/components/evidence/EvidenceExportModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { mockLatency } from "@/lib/mockLatency";
import Link from "next/link";
import { Suspense } from "react";

async function EvidenceBody() {
  await mockLatency(200);
  return (
    <div className="flex flex-col gap-6 px-6 pb-12 pt-6">
      <PageHeader
        title="Evidence"
        subtitle="Tamper-aware bundles for audits, regulated workflows, and incident review."
        breadcrumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/evidence", label: "Evidence" },
        ]}
        actions={<EvidenceExportModal />}
      />

      <div className="overflow-hidden rounded-card border border-border-default">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border-subtle bg-bg-panel text-xs uppercase tracking-wide text-fg-faint">
            <tr>
              <th className="px-4 py-3 font-medium">Bundle</th>
              <th className="px-4 py-3 font-medium">Scope</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">SHA256</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-bg-panel">
            <tr className="hover:bg-bg-elevated">
              <td className="px-4 py-3 text-fg-primary">production-weekly</td>
              <td className="px-4 py-3 text-fg-muted">Fleet · prod</td>
              <td className="px-4 py-3 text-fg-muted">2026-05-01 08:12 UTC</td>
              <td className="px-4 py-3 font-mono text-xs text-fg-faint">e3b0c44298fc1c14…</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-3">
                  <Link
                    href="/api/v1/evidence/bundles/bundle-production-weekly"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-accent-blue hover:underline"
                  >
                    Meta
                  </Link>
                  <Link
                    href="/api/v1/evidence/bundles/bundle-production-weekly/file"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-accent-blue hover:underline"
                  >
                    Artifact
                  </Link>
                </div>
              </td>
            </tr>
            <tr className="hover:bg-bg-elevated">
              <td className="px-4 py-3 text-fg-primary">host-07-incident</td>
              <td className="px-4 py-3 text-fg-muted">host-07</td>
              <td className="px-4 py-3 text-fg-muted">2026-04-30 21:03 UTC</td>
              <td className="px-4 py-3 font-mono text-xs text-fg-faint">a9f12bde045…</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-3">
                  <Link
                    href="/api/v1/evidence/bundles/bundle-host-07-incident"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-accent-blue hover:underline"
                  >
                    Meta
                  </Link>
                  <Link
                    href="/api/v1/evidence/bundles/bundle-host-07-incident/file"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-accent-blue hover:underline"
                  >
                    Artifact
                  </Link>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

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
