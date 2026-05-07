"use client";

/**
 * DriftTrendChart — inline SVG sparkline showing daily drift counts.
 *
 * Fetches from GET /api/v1/drift/trend and renders a simple bar chart.
 * Zero-state gracefully shows "No trend data yet".
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

const BAR_W = 24;
const BAR_GAP = 8;
const CHART_H = 56;

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
      <div className="h-14 animate-pulse rounded bg-bg-elevated" aria-label="Loading drift trend" />
    );
  }

  if (days.length === 0) {
    return (
      <p className="text-xs text-fg-faint">No trend data yet — run a scan to begin tracking.</p>
    );
  }

  const maxTotal = Math.max(1, ...days.map((d) => d.total));
  const chartW = days.length * (BAR_W + BAR_GAP) - BAR_GAP;

  return (
    <div className="flex flex-col gap-2">
      <svg
        width={chartW}
        height={CHART_H}
        viewBox={`0 0 ${chartW} ${CHART_H}`}
        aria-label="Drift trend chart"
        role="img"
        className="overflow-visible"
      >
        {days.map((d, i) => {
          const x = i * (BAR_W + BAR_GAP);
          const totalH = Math.round((d.total / maxTotal) * CHART_H);
          const highH = Math.round((d.high / maxTotal) * CHART_H);
          const medH = Math.round((d.medium / maxTotal) * CHART_H);
          const lowH = totalH - highH - medH;
          let y = CHART_H;

          const segments: { color: string; h: number }[] = [];
          if (lowH > 0) segments.push({ color: severityColor("low"), h: lowH });
          if (medH > 0) segments.push({ color: severityColor("medium"), h: medH });
          if (highH > 0) segments.push({ color: severityColor("high"), h: highH });

          return (
            <g key={d.ymd}>
              {d.total === 0 ? (
                <rect
                  x={x}
                  y={CHART_H - 3}
                  width={BAR_W}
                  height={3}
                  rx={2}
                  fill="currentColor"
                  className="text-border-subtle"
                />
              ) : (
                segments.map((seg, si) => {
                  y -= seg.h;
                  return (
                    <rect
                      key={si}
                      x={x}
                      y={y}
                      width={BAR_W}
                      height={seg.h}
                      fill={seg.color}
                      rx={si === segments.length - 1 ? 2 : 0}
                      opacity={0.85}
                    />
                  );
                })
              )}
              <text
                x={x + BAR_W / 2}
                y={CHART_H + 12}
                textAnchor="middle"
                fontSize={9}
                fill="currentColor"
                className="text-fg-faint"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-fg-faint">
        {(["high", "medium", "low"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: severityColor(s) }}
            />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
