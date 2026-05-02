"use client";

import { apiConfig } from "@/lib/api/config";

/** Shown when `NEXT_PUBLIC_USE_MOCK` is not `false` — inventory and some APIs use mock/demo paths. */
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
        — set <code className="rounded bg-bg-panel px-1 py-0.5 font-mono text-[11px]">NEXT_PUBLIC_USE_MOCK=false</code> for live
        collectors and APIs.
      </span>
    </div>
  );
}
