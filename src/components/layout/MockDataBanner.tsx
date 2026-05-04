"use client";

import { apiConfig } from "@/lib/api/config";

/** Shown when `NEXT_PUBLIC_USE_MOCK=true` — inventory uses seeded demo rows (e.g. e2e). */
export function MockDataBanner() {
  if (!apiConfig.useMock) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Mock data mode"
      className="border-b border-warning-amber/40 bg-warning-amber-soft px-4 py-2 text-center text-xs text-fg-primary"
    >
      <span className="font-semibold text-warning-amber">Mock data mode</span>
      <span className="text-fg-muted">
        {" "}
        — unset <code className="rounded bg-bg-panel px-1 py-0.5 font-mono text-[11px]">NEXT_PUBLIC_USE_MOCK</code> or set it to{" "}
        <code className="rounded bg-bg-panel px-1 py-0.5 font-mono text-[11px]">false</code> for live collectors.
      </span>
    </div>
  );
}
