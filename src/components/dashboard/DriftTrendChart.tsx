"use client";

/**
 * DriftTrendChart — responsive stacked bar chart of daily drift counts.
 *
 * Fetches from GET /api/v1/drift/trend and renders a chart that fills the
 * available width of its container. Each bar is a vertical stack of
 * low / medium / high segments, sized as a percentage of the busiest day
 * in the window.
 *
 * Zero-state shows "No trend data yet". Empty days within the window still
 * render a faint baseline tick so the time axis stays anchored.
 */

import { useEffect, useState } from "react";

interface TrendDay {
  ymd: string;
  label: string;
  high: number;
  medium: number;
  low: number;
  total: number;
}

interface TrendResponse {
  days: TrendDay[];
}

const CHART_HEIGHT_PX = 160;

function severityColor(s: "high" | "medium" | "low"): string {
  if (s === "high") return "var(--danger-red)";
  if (s === "medium") return "var(--warning-amber)";
  return "var(--success-green)";
}

export function DriftTrendChart() {
  const [days, setDays] = useState<TrendDay[]>([]);
  const [loading, setLoading] = useState(true);

  // Standard fetch-on-mount with spinner — Compiler rule prefers
  // Suspense, but the chart is decorative and shouldn't block its
  // surrounding dashboard layout.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch("/api/v1/drift/trend")
      .then((r) => r.json())
      .then((d: TrendResponse) => setDays(d.days ?? []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading drift trend"
        className="w-full animate-pulse rounded bg-bg-elevated"
        style={{ height: CHART_HEIGHT_PX }}
      />
    );
  }

  if (days.length === 0) {
    return (
      <p className="text-xs text-fg-faint">No trend data yet — run a scan to begin tracking.</p>
    );
  }

  const maxTotal = Math.max(1, ...days.map((d) => d.total));
  const grandTotal = days.reduce((acc, d) => acc + d.total, 0);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative flex w-full items-end justify-between gap-2"
        style={{ height: CHART_HEIGHT_PX }}
        role="img"
        aria-label={`Drift trend chart: ${grandTotal} total findings across ${days.length} days`}
      >
        {/* faint baseline */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border-subtle" />

        {days.map((d) => {
          const totalPct = (d.total / maxTotal) * 100;
          const highPct = d.total === 0 ? 0 : (d.high / d.total) * totalPct;
          const medPct = d.total === 0 ? 0 : (d.medium / d.total) * totalPct;
          const lowPct = d.total === 0 ? 0 : (d.low / d.total) * totalPct;

          return (
            <div
              key={d.ymd}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              {d.total > 0 ? (
                <div
                  className="flex w-full max-w-[40px] flex-col-reverse overflow-hidden rounded-t-sm transition-opacity hover:opacity-90"
                  style={{ height: `${totalPct}%` }}
                  title={`${d.label} — ${d.total} finding${d.total === 1 ? "" : "s"} (high ${d.high}, medium ${d.medium}, low ${d.low})`}
                >
                  {lowPct > 0 ? (
                    <div
                      style={{
                        height: `${(lowPct / totalPct) * 100}%`,
                        background: severityColor("low"),
                      }}
                    />
                  ) : null}
                  {medPct > 0 ? (
                    <div
                      style={{
                        height: `${(medPct / totalPct) * 100}%`,
                        background: severityColor("medium"),
                      }}
                    />
                  ) : null}
                  {highPct > 0 ? (
                    <div
                      style={{
                        height: `${(highPct / totalPct) * 100}%`,
                        background: severityColor("high"),
                      }}
                    />
                  ) : null}
                </div>
              ) : (
                <div
                  className="w-full max-w-[40px] rounded-sm bg-border-subtle"
                  style={{ height: 3 }}
                  title={`${d.label} — 0 findings`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* X-axis labels in their own row so they never overlap the bars */}
      <div className="flex w-full items-start justify-between gap-2">
        {days.map((d) => (
          <span
            key={`label-${d.ymd}`}
            className="min-w-0 flex-1 text-center text-[11px] tabular-nums text-fg-faint"
          >
            {d.label}
          </span>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-faint">
        {(["high", "medium", "low"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: severityColor(s) }}
            />
            <span className="capitalize">{s}</span>
          </span>
        ))}
        <span className="ml-auto text-fg-muted">
          {grandTotal} finding{grandTotal === 1 ? "" : "s"} in window
        </span>
      </div>
    </div>
  );
}
