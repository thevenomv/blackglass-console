"use client";

import { Button } from "@/components/ui/Button";
import { useScanJobs } from "@/components/providers/ScanJobsProvider";

export function ScanJobBanner() {
  const { jobs, dismiss } = useScanJobs();
  const visible = jobs.filter((j) => j.phase !== "succeeded");

  if (visible.length === 0) return null;

  return (
    <div
      className="sticky top-0 z-50 border-b border-border-default bg-bg-elevated/95 px-6 py-3 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Active integrity scans"
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3">
        {visible.map((j) => (
          <div
            key={j.id}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3 ${
              j.phase === "failed"
                ? "border-danger/45 bg-danger-soft/30"
                : "border-accent-blue/35 bg-accent-blue-soft/35"
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg-primary">{j.label}</p>
              <p className="text-xs text-fg-muted">{j.detail}</p>
              <div className="mt-2 h-1.5 w-full max-w-md rounded-full bg-track">
                <div
                  className={`h-1.5 rounded-full transition-[width] duration-300 ${
                    j.phase === "failed" ? "bg-danger" : "bg-accent-blue"
                  }`}
                  style={{ width: `${j.progress}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-xs ${
                  j.phase === "failed" ? "text-danger" : "text-fg-faint"
                }`}
              >
                {j.phase}
              </span>
              <Button variant="ghost" type="button" onClick={() => dismiss(j.id)}>
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
