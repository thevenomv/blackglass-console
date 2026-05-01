"use client";

import type { ReportRecord } from "@/data/mock/types";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type StatusFilter = "all" | ReportRecord["status"];

function formatGenerated(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ReportsView({ reports }: { reports: ReportRecord[] }) {
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return reports;
    return reports.filter((r) => r.status === filter);
  }, [reports, filter]);

  const chips: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "ready", label: "Ready" },
    { id: "generating", label: "Generating" },
    { id: "failed", label: "Failed" },
  ];

  function statusBadge(status: ReportRecord["status"]) {
    if (status === "ready") return <Badge tone="success">Ready</Badge>;
    if (status === "generating") return <Badge tone="warning">Generating</Badge>;
    return <Badge tone="danger">Failed</Badge>;
  }

  return (
    <div className="flex flex-col gap-6 px-6 pb-12 pt-6">
      <PageHeader
        title="Reports"
        subtitle="Integrity summaries for leadership, auditors, or customer deliverables."
        actions={<Button type="button">Generate report</Button>}
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Report filters">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={filter === c.id}
            onClick={() => setFilter(c.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === c.id
                ? "border-accent-blue bg-accent-blue-soft text-accent-blue"
                : "border-border-default text-fg-muted hover:border-border-subtle hover:text-fg-primary"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No reports for this filter"
          description="Generate a report from the latest fleet scan or schedule recurring summaries."
          action={<Button type="button">Generate report</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border-default">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border-subtle bg-bg-panel text-xs uppercase tracking-wide text-fg-faint">
              <tr>
                <th className="px-4 py-3 font-medium">Report</th>
                <th className="px-4 py-3 font-medium">Scope</th>
                <th className="px-4 py-3 font-medium">Generated</th>
                <th className="px-4 py-3 font-medium">Format</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle bg-bg-panel">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-bg-elevated">
                  <td className="px-4 py-3 text-fg-primary">{r.title}</td>
                  <td className="px-4 py-3 text-fg-muted">{r.scope}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatGenerated(r.generatedAt)} UTC</td>
                  <td className="px-4 py-3 font-mono text-xs uppercase text-fg-faint">{r.format}</td>
                  <td className="px-4 py-3">{statusBadge(r.status)}</td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "ready" ? (
                      <button type="button" className="text-xs font-semibold text-accent-blue hover:underline">
                        Download
                      </button>
                    ) : r.status === "generating" ? (
                      <span className="text-xs text-fg-faint">Queued…</span>
                    ) : (
                      <button type="button" className="text-xs font-semibold text-accent-blue hover:underline">
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-fg-faint">
        Preview narratives reference{" "}
        <Link href="/" className="text-accent-blue hover:underline">
          fleet posture
        </Link>{" "}
        — swap mock rows for <span className="font-mono">GET /reports</span> when wiring APIs.
      </p>
    </div>
  );
}
