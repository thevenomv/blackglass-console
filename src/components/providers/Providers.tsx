"use client";

import { ScanJobBanner } from "@/components/scan/ScanJobBanner";
import { ScanJobsProvider } from "@/components/providers/ScanJobsProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ScanJobsProvider>
      <ScanJobBanner />
      {children}
    </ScanJobsProvider>
  );
}
