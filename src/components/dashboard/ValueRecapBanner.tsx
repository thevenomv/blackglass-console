/**
 * Value-recap banner — surfaces 3 headline metrics at the top of the dashboard
 * to reinforce the product's core value proposition at a glance.
 *
 * Metrics:
 *   - Total open drift findings
 *   - High-severity findings that need urgent review
 *   - Fleet risk score (1-10, computed by risk-score.ts)
 *   - Findings remediated / verified (closed this session/cycle)
 */
"use client";

import type { RiskPriority } from "@/lib/server/risk-score";

export type ValueRecap = {
  openFindings: number;
  highSevFindings: number;
  remediatedFindings: number;
  fleetRiskScore: number;
  fleetRiskPriority: RiskPriority;
};

function RiskGauge({ score, priority }: { score: number; priority: RiskPriority }) {
  const fill = (score / 10) * 100;
  const color =
    priority === "critical"
      ? "#ef4444"
      : priority === "high"
        ? "#f97316"
        : priority === "medium"
          ? "#3b82f6"
          : "#6b7280";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-border-subtle">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${fill}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-lg font-bold" style={{ color }}>
        {score.toFixed(1)}
        <span className="ml-0.5 text-xs font-medium text-fg-faint">/10</span>
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  sublabel,
}: {
  label: string;
  value: number | string;
  tone?: "danger" | "warning" | "success" | "neutral";
  sublabel?: string;
}) {
  const valueColor =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-fg-primary";
  return (
    <div className="flex min-w-[100px] flex-col gap-0.5 px-4 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</span>
      {sublabel ? <span className="text-xs text-fg-faint">{sublabel}</span> : null}
    </div>
  );
}

export function ValueRecapBanner({ recap }: { recap: ValueRecap }) {
  if (recap.openFindings === 0 && recap.fleetRiskScore === 0) {
    // Nothing to surface — clean fleet
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-success/35 bg-success-soft/20 px-4 py-3 text-sm text-fg-muted">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full bg-success"
        />
        <span>
          <span className="font-medium text-fg-primary">Fleet is clean.</span> No open drift
          findings and no elevated risk signals.
        </span>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Fleet value recap"
      className="overflow-hidden rounded-card border border-border-default bg-bg-panel"
    >
      <div className="flex flex-wrap divide-x divide-border-subtle">
        <Stat
          label="Open findings"
          value={recap.openFindings}
          tone={recap.openFindings > 0 ? "warning" : "success"}
          sublabel="new + triaged"
        />
        <Stat
          label="High severity"
          value={recap.highSevFindings}
          tone={recap.highSevFindings > 0 ? "danger" : "success"}
          sublabel="need urgent review"
        />
        <Stat
          label="Remediated"
          value={recap.remediatedFindings}
          tone={recap.remediatedFindings > 0 ? "success" : "neutral"}
          sublabel="closed this cycle"
        />
        <div className="flex min-w-[140px] flex-col items-start gap-1.5 px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
            Fleet risk score
          </span>
          <RiskGauge score={recap.fleetRiskScore} priority={recap.fleetRiskPriority} />
        </div>
      </div>
    </div>
  );
}
