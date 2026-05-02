import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardV3 } from "@/components/dashboard/DashboardV3";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { FetchFailed } from "@/components/ui/FetchFailed";
import { fetchFleetPageData } from "@/lib/api/fleet";
import { fetchHosts } from "@/lib/api/hosts";
import { baselineStoreHealth } from "@/lib/server/baseline-store";
import { collectorConfigured } from "@/lib/server/collector";
import { deriveDriftCardsFromEvents, pickSpotlightHost } from "@/lib/server/dashboard-context";
import { resolveDriftEventsForDashboard } from "@/lib/server/drift-resolve";
import { loadHosts } from "@/lib/server/inventory";

// Dashboard always needs live data — skip static prerender.
export const dynamic = "force-dynamic";

async function DashboardDeferred() {
  try {
    const { fleet, showDemoKpiDeltas } = await fetchFleetPageData();
    const liveMode = !showDemoKpiDeltas;
    const collectorOn = collectorConfigured();
    const baselinePersistence = baselineStoreHealth();
    const driftEvents = resolveDriftEventsForDashboard();

    let spotlightHost = (collectorOn ? pickSpotlightHost(await loadHosts()) : null) ?? null;
    if (liveMode && !spotlightHost) {
      spotlightHost = pickSpotlightHost((await fetchHosts()).items);
    }

    const { driftTopCategories, recommendedActionHostId } = liveMode
      ? deriveDriftCardsFromEvents(driftEvents, spotlightHost)
      : { driftTopCategories: [], recommendedActionHostId: null };

    const ctaHostId =
      recommendedActionHostId ??
      fleet.notableEvents[0]?.hostId ??
      spotlightHost?.id ??
      null;

    return (
      <DashboardV3
        fleet={fleet}
        showDemoKpiDeltas={showDemoKpiDeltas}
        collectorConfigured={collectorOn}
        driftTopCategories={driftTopCategories}
        spotlightHost={spotlightHost}
        ctaHostId={ctaHostId}
        baselinePersistence={baselinePersistence}
      />
    );
  } catch {
    return (
      <FetchFailed title="Fleet snapshot unavailable" description="Could not load fleet KPIs from the configured API." />
    );
  }
}

export default function HomePage() {
  return (
    <AppShell>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardDeferred />
      </Suspense>
    </AppShell>
  );
}
