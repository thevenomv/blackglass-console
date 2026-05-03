"use client";

import type { ReportRecord } from "@/data/mock/types";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

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

function reportAgeWarning(generatedAt: string): boolean {
  const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;
  try {
    return Date.now() - new Date(generatedAt).getTime() > MS_30_DAYS;
  } catch {
    return false;
  }
}

function NewReportModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const trapRef = useFocusTrap(true, onClose);
  const [scope, setScope] = useState<"fleet" | "tags" | "host">("fleet");
  const [format, setFormat] = useState<"markdown" | "pdf">("markdown");
  const [generating, setGenerating] = useState(false);

  const submit = async () => {
    setGenerating(true);
    try {
      await fetch("/api/v1/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, format }),
      });
      toast("Report generation queued — check back shortly.", "success");
      onClose();
    } catch {
      toast("Failed to queue report — try again.", "danger");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-labelledby="new-report-title"
        aria-modal="true"
        className="w-full max-w-md rounded-card border border-border-default bg-bg-panel shadow-elevated outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-border-subtle px-6 py-5">
          <h2 id="new-report-title" className="text-lg font-semibold text-fg-primary">
            Generate new report
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Choose the scope and format for this integrity summary.
          </p>
        </header>
        <div className="space-y-5 px-6 py-5">
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-wide text-fg-faint">
              Scope
            </legend>
            {(["fleet", "tags", "host"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm text-fg-muted">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === s}
                  onChange={() => setScope(s)}
                  className="accent-[var(--accent-blue)]"
                />
                {s === "fleet" ? "Full fleet" : s === "tags" ? "Fleet tags" : "Single host"}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-wide text-fg-faint">
              Format
            </legend>
            {(["markdown", "pdf"] as const).map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm text-fg-muted">
                <input
                  type="radio"
                  name="format"
                  checked={format === f}
                  onChange={() => setFormat(f)}
                  className="accent-[var(--accent-blue)]"
                />
                {f === "markdown" ? "Markdown narrative" : "PDF"}
              </label>
            ))}
          </fieldset>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle px-6 py-4">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={generating} onClick={() => void submit()}>
            {generating ? "Queuing…" : "Generate"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ReportsView({ reports }: { reports: ReportRecord[] }) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [newReportOpen, setNewReportOpen] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

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
        actions={<Button type="button" onClick={() => setNewReportOpen(true)}>Generate report</Button>}
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
          action={<Button type="button" onClick={() => setNewReportOpen(true)}>Generate report</Button>}
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
                  <td className="px-4 py-3 text-fg-primary">
                    <span>{r.title}</span>
                    {reportAgeWarning(r.generatedAt) ? (
                      <span
                        title="Report is older than 30 days"
                        className="ml-2 rounded-full border border-warning/40 bg-warning-soft/60 px-1.5 py-0.5 text-[10px] font-medium text-warning"
                      >
                        &gt;30d old
                      </span>
                    ) : null}
                  </td>
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
                      <button
                        type="button"
                        disabled={retrying === r.id}
                        className="text-xs font-semibold text-accent-blue hover:underline disabled:opacity-50"
                        onClick={() => {
                          setRetrying(r.id);
                          void fetch("/api/v1/reports", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ reportId: r.id }),
                          })
                            .then(() => toast(`Report "${r.title}" queued for regeneration.`, "success"))
                            .catch(() => toast("Retry failed — try again.", "danger"))
                            .finally(() => setRetrying(null));
                        }}
                      >
                        {retrying === r.id ? "Retrying…" : "Retry"}
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
        <Link href="/dashboard" className="text-accent-blue hover:underline">
          fleet posture
        </Link>{" "}
        — swap mock rows for <span className="font-mono">GET /reports</span> when wiring APIs.
      </p>

      {newReportOpen ? <NewReportModal onClose={() => setNewReportOpen(false)} /> : null}
    </div>
  );
}
