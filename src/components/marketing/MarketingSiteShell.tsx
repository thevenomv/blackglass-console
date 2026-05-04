"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MarketingNav } from "./MarketingNav";
import { PublicFooter } from "./PublicFooter";

/** Routes under (marketing) that ship their own chrome (demo workspace, Clerk auth). */
const STANDALONE_PREFIXES = ["/demo", "/sign-in", "/sign-up"] as const;

function isStandaloneMarketingPath(pathname: string): boolean {
  return STANDALONE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Shared marketing header + footer. Skips wrapping for `/demo/*` and Clerk sign-in/up
 * so those flows keep full-height layouts.
 */
export function MarketingSiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname && isStandaloneMarketingPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-base text-fg-muted">
      <MarketingNav />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <PublicFooter />
    </div>
  );
}
