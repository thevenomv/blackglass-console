"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { MockDataBanner } from "@/components/layout/MockDataBanner";
import { MobileNavBar } from "@/components/layout/MobileNavBar";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-bg-base">
      <div className="hidden shrink-0 lg:block">
        <Sidebar />
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Primary navigation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 max-w-[88vw] overflow-y-auto border-r border-border-default bg-bg-sidebar shadow-elevated">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <MobileNavBar onOpenNav={() => setMobileOpen(true)} />
        <MockDataBanner />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
