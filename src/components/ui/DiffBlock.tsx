import type { DiffChangeType, DriftSeverity } from "@/data/mock/types";
import { Badge } from "./Badge";

const changeLabel: Record<DiffChangeType, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};

function severityTone(s: DriftSeverity): "danger" | "warning" | "neutral" {
  if (s === "high") return "danger";
  if (s === "medium") return "warning";
  return "neutral";
}

export function DiffChangeMarker({ change }: { change: DiffChangeType }) {
  const styles: Record<DiffChangeType, string> = {
    added: "border-success/50 bg-success-soft/60 text-success",
    removed: "border-danger/50 bg-danger-soft/50 text-danger",
    changed: "border-warning/50 bg-warning-soft/60 text-warning",
  };
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${styles[change]}`}
    >
      {changeLabel[change]}
    </span>
  );
}

export function DiffBlock({
  path,
  change,
  severity,
  summary,
  before,
  after,
}: {
  path: string;
  change: DiffChangeType;
  severity: DriftSeverity;
  summary: string;
  before?: string;
  after?: string;
}) {
  return (
    <article className="rounded-card border border-border-default bg-bg-base/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <DiffChangeMarker change={change} />
        <Badge tone={severityTone(severity)}>{severity}</Badge>
        <span className="font-mono text-[13px] text-fg-primary">{path}</span>
      </div>
      <p className="mt-3 text-sm text-fg-muted">{summary}</p>
      {(before !== undefined || after !== undefined) && (
        <dl className="mt-4 grid gap-3 font-mono text-[12px] sm:grid-cols-2">
          <div className="rounded-md border border-border-subtle bg-bg-panel px-3 py-2">
            <dt className="text-fg-faint">Baseline</dt>
            <dd className="mt-1 text-fg-muted">{before ?? "—"}</dd>
          </div>
          <div className="rounded-md border border-border-subtle bg-bg-panel px-3 py-2">
            <dt className="text-fg-faint">Current</dt>
            <dd className="mt-1 text-fg-primary">{after ?? "—"}</dd>
          </div>
        </dl>
      )}
    </article>
  );
}
