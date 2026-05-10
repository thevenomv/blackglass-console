import type { ReactNode } from "react";
import { MarketingSiteShell } from "@/components/marketing/MarketingSiteShell";
import { PlausibleScript } from "@/components/marketing/PlausibleScript";

/** Public marketing, legal, demo, and Clerk auth entry — URLs unchanged by this route group. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PlausibleScript />
      <MarketingSiteShell>{children}</MarketingSiteShell>
    </>
  );
}