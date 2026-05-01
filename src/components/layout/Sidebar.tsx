"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/hosts", label: "Hosts" },
  { href: "/baselines", label: "Baselines" },
  { href: "/drift", label: "Drift" },
  { href: "/evidence", label: "Evidence" },
  { href: "/reports", label: "Reports" },
  { href: "/demo", label: "Demo" },
  { href: "/settings", label: "Settings" },
] as const;

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border-default bg-bg-sidebar">
      <div className="border-b border-border-subtle px-5 py-5">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-fg-faint">
          Blackglass
        </p>
        <p className="mt-1 text-sm font-semibold text-fg-primary">
          Operational integrity
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3 pb-2" aria-label="Primary">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
              className={`relative rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                active
                  ? "bg-bg-elevated text-fg-primary before:absolute before:left-0 before:top-1 before:h-[calc(100%-8px)] before:w-[3px] before:rounded-full before:bg-accent-blue"
                  : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border-subtle p-3">
        <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint">
          Appearance
        </p>
        <ThemeToggle />
        <p className="mt-2 font-mono text-[10px] text-fg-faint">
          Palette: <kbd className="rounded border border-border-subtle px-1">⌘K</kbd>
        </p>
      </div>
    </aside>
  );
}
