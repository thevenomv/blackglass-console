"use client";

import dynamic from "next/dynamic";
import { ScanJobsProvider } from "@/components/providers/ScanJobsProvider";
import { ToastProvider } from "@/components/ui/Toast";

// Skip SSR for UI-only overlays — they have no meaningful server-rendered content
// and both depend on client-only state (scan jobs context, keyboard events).
const ScanJobBanner = dynamic(
  () => import("@/components/scan/ScanJobBanner").then((m) => ({ default: m.ScanJobBanner })),
  { ssr: false },
);
const CommandPalette = dynamic(
  () => import("@/components/command/CommandPalette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
);

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
