"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEMO_TENANT_NAME } from "@/lib/demo/seed";
import { TrialSignupLink } from "@/components/demo/DemoGateButton";

const LINKS = [
  { href: "/demo", label: "Overview" },
  { href: "/demo/showcase", label: "Showcase" },
  { href: "/demo/hosts", label: "Hosts" },
  { href: "/demo/drift", label: "Findings" },
  { href: "/demo/timeline", label: "Drift timeline" },
  { href: "/demo/reports", label: "Reports" },
  { href: "/demo/members", label: "Members" },
] as const;

export function DemoChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-bg-base">
      <div
        role="status"
        aria-live="polite"
        className="border-b border-amber-600/35 bg-amber-100/85 px-4 py-2 text-center text-xs text-amber-950"
      >
        <strong className="font-semibold">Sample workspace</strong> — {DEMO_TENANT_NAME}. Data is
        fictional and resets on refresh. No SSH or API calls to your systems.
      </div>
      <header className="border-b border-border-default bg-bg-panel px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-fg-faint">
              BLACKGLASS demo
            </p>
            <p className="text-sm font-medium text-fg-primary">{DEMO_TENANT_NAME}</p>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Demo sections">
            {LINKS.map((l) => {
              const active = pathname === l.href || (l.href !== "/demo" && pathname.startsWith(l.href));
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-md px-2.5 py-1.5 transition-colors ${
                    active
                      ? "bg-bg-elevated font-medium text-fg-primary"
                      : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-card border border-border-subtle px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg-primary"
            >
              Home
            </Link>
            <TrialSignupLink className="rounded-card bg-accent-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-blue-hover">
              Start free trial
            </TrialSignupLink>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
