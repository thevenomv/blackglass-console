"use client";

import { ScanJobBanner } from "@/components/scan/ScanJobBanner";
import { ScanJobsProvider } from "@/components/providers/ScanJobsProvider";
import { CommandPalette } from "@/components/command/CommandPalette";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ScanJobsProvider>
      <ScanJobBanner />
      <CommandPalette />
      {children}
    </ScanJobsProvider>
  );
}
