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
import type { HostRecord } from "@/data/mock/types";
import { loadHosts } from "@/lib/server/inventory";

export const dynamic = "force-dynamic";

async function DashboardDeferred() {
  let fleet: Awaited<ReturnType<typeof fetchFleetPageData>>["fleet"];
  let showDemoKpiDeltas: boolean;
  let driftTopCategories: ReturnType<typeof deriveDriftCardsFromEvents>["driftTopCategories"];
  let spotlightHost: HostRecord | null;
  let ctaHostId: string | null;
  let baselinePersistence: ReturnType<typeof baselineStoreHealth>;
  let collectorOn: boolean;

  try {
    const page = await fetchFleetPageData();
    fleet = page.fleet;
    showDemoKpiDeltas = page.showDemoKpiDeltas;
    const liveMode = !showDemoKpiDeltas;
    collectorOn = collectorConfigured();
    baselinePersistence = baselineStoreHealth();
    const driftEvents = resolveDriftEventsForDashboard();

    let sh = (collectorOn ? pickSpotlightHost(await loadHosts()) : null) ?? null;
    if (liveMode && !sh) {
      sh = pickSpotlightHost((await fetchHosts()).items);
    }
    spotlightHost = sh;

    const derived = liveMode
      ? deriveDriftCardsFromEvents(driftEvents, spotlightHost)
      : { driftTopCategories: [], recommendedActionHostId: null };
    driftTopCategories = derived.driftTopCategories;

    ctaHostId =
      derived.recommendedActionHostId ??
      fleet.notableEvents[0]?.hostId ??
      spotlightHost?.id ??
      null;
  } catch {
    return (
      <FetchFailed title="Fleet snapshot unavailable" description="Could not load fleet KPIs from the configured API." />
    );
  }

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
}

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardDeferred />
      </Suspense>
    </AppShell>
  );
}
