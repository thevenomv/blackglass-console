"use client";

import { ScanJobBanner } from "@/components/scan/ScanJobBanner";
import { ScanJobsProvider } from "@/components/providers/ScanJobsProvider";
import { CommandPalette } from "@/components/command/CommandPalette";
import { ToastProvider } from "@/components/ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ScanJobsProvider>
        <ScanJobBanner />
        <CommandPalette />
        {children}
      </ScanJobsProvider>
    </ToastProvider>
  );
}
