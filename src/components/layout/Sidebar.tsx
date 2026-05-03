"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useSession } from "@/components/auth/SessionProvider";
import { signOut } from "@/app/(auth)/login/actions";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import type { TenantRole } from "@/lib/saas/tenant-role";

const clerkPk =
  typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string"
    ? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    : "";
const clerkOn = clerkPk.length > 0;

const NAV_BASE = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/hosts", label: "Hosts" },
  { href: "/baselines", label: "Baselines" },
  { href: "/drift", label: "Drift" },
  { href: "/workspace", label: "Workspace" },
  { href: "/evidence", label: "Evidence" },
  { href: "/reports", label: "Reports" },
  { href: "/demo", label: "Demo" },
  { href: "/settings", label: "Settings" },
  ...(clerkOn
    ? [
        { href: "/settings/members", label: "Members" },
        { href: "/settings/billing", label: "Billing" },
      ]
    : []),
  { href: "/pricing", label: "Pricing" },
  { href: "/welcome", label: "Get started" },
] as const;

const GUEST_AUDITOR_HREFS = new Set([
  "/dashboard",
  "/evidence",
  "/reports",
  "/pricing",
  "/welcome",
]);

function navItemsForTenant(tenantRole: TenantRole | null): readonly (typeof NAV_BASE)[number][] {
  if (tenantRole !== "guest_auditor") return NAV_BASE;
  return NAV_BASE.filter((item) => GUEST_AUDITOR_HREFS.has(item.href));
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { role, authenticated, tenantRole } = useSession();

  const NAV = navItemsForTenant(tenantRole);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border-default bg-bg-sidebar">
      <div className="border-b border-border-subtle px-5 py-5">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-fg-faint">
          BLACKGLASS
        </p>
        <p className="mt-1 text-[10px] font-medium text-fg-faint">
          by Obsidian Dynamics Limited
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3 pb-2" aria-label="Primary">
        {NAV.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
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
        {clerkOn ? (
          <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
            <OrganizationSwitcher
              hidePersonal
              afterCreateOrganizationUrl="/dashboard"
              afterSelectOrganizationUrl="/dashboard"
              appearance={{
                elements: {
                  rootBox: "w-full max-w-full",
                  organizationSwitcherTrigger: "w-full justify-between",
                },
              }}
            />
            <div className="flex justify-end">
              <UserButton />
            </div>
          </div>
        ) : null}
        {!clerkOn && authenticated && (
          <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
              {role}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="font-mono text-[10px] uppercase tracking-widest text-fg-faint transition-colors hover:text-fg-primary"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
        <div className="mt-3 border-t border-border-subtle pt-3 font-mono text-[10px] text-fg-faint">
          <p className="mb-1.5 uppercase tracking-widest">Legal</p>
          <div className="flex flex-col gap-1">
            <Link href="/terms" className="text-fg-muted hover:text-fg-primary hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="text-fg-muted hover:text-fg-primary hover:underline">
              Privacy
            </Link>
            <Link href="/dpa" className="text-fg-muted hover:text-fg-primary hover:underline">
              Data processing
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
