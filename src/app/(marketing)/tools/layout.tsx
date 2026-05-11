import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tools — Blackglass",
  description:
    "Free, browser-based tools from Blackglass: estimate cloud waste, score Linux drift risk, and compare inventory snapshots — no signup, no API keys.",
};

const SUB_NAV = [
  { href: "/tools", label: "Overview" },
  { href: "/tools/cloud-waste-estimator", label: "Cloud Waste Estimator" },
  { href: "/tools/linux-drift-risk", label: "Linux Drift Risk" },
  { href: "/tools/cloud-inventory-diff", label: "Inventory Diff" },
] as const;

/**
 * Shared chrome for `/tools/*` — short hero strip + horizontal sub-nav.
 * Each nested page renders its own `<main>` body underneath. Kept as a
 * server component so it can ship in the static HTML payload.
 */
export default function ToolsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg-base">
      <div className="border-b border-border-subtle bg-bg-panel/40">
        <div className="mx-auto max-w-7xl px-4 pt-10 pb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">
            Blackglass Tools
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg-primary">
            Free utilities for Linux fleets and cloud accounts
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
            Pre-scan planning tools you can run in the browser — no signup, no credentials.
            They give you a defensible starting point; real scans, approvals, and history live in
            Blackglass and Charon.
          </p>
        </div>
        <nav
          aria-label="Tools sub-navigation"
          className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 text-sm"
        >
          {SUB_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-fg-muted whitespace-nowrap transition-colors hover:bg-bg-elevated hover:text-fg-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
