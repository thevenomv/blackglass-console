import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardV3 } from "./_components/DashboardV3";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { FetchFailed } from "@/components/ui/FetchFailed";
import { fetchFleetPageData } from "@/lib/api/fleet";
import { fetchHosts } from "@/lib/api/hosts";
import { baselineStoreHealth } from "@/lib/server/baseline-store";
import { collectorConfigured } from "@/lib/server/collector";
import { deriveDriftCardsFromEvents, pickSpotlightHost } from "@/lib/server/dashboard-context";
import { resolveDriftEventsForDashboardAsync } from "@/lib/server/drift-resolve";
import { fleetRiskScore, riskPriorityFromScore } from "@/lib/server/risk-score";
import type { HostRecord } from "@/data/mock/types";
import { loadHosts } from "@/lib/server/inventory";
import { SandboxBanner } from "@/components/sandbox/SandboxBanner";
import type { ValueRecap } from "@/components/dashboard/ValueRecapBanner";

export const dynamic = "force-dynamic";

async function DashboardDeferred() {
  let fleet: Awaited<ReturnType<typeof fetchFleetPageData>>["fleet"];
  let showDemoKpiDeltas: boolean;
  let driftTopCategories: ReturnType<typeof deriveDriftCardsFromEvents>["driftTopCategories"];
  let spotlightHost: HostRecord | null;
  let ctaHostId: string | null;
  let baselinePersistence: ReturnType<typeof baselineStoreHealth>;
  let collectorOn: boolean;
  let valueRecap: ValueRecap;

  try {
    const page = await fetchFleetPageData();
    fleet = page.fleet;
    showDemoKpiDeltas = page.showDemoKpiDeltas;
    const liveMode = !showDemoKpiDeltas;
    collectorOn = collectorConfigured();
    baselinePersistence = baselineStoreHealth();
    const driftEvents = await resolveDriftEventsForDashboardAsync();

    // Compute value-recap metrics from current drift events
    const openFindings = driftEvents.filter(
      (e) => e.lifecycle === "new" || e.lifecycle === "triaged",
    ).length;
    const highSevFindings = driftEvents.filter(
      (e) => (e.lifecycle === "new" || e.lifecycle === "triaged") && e.severity === "high",
    ).length;
    const remediatedFindings = driftEvents.filter(
      (e) => e.lifecycle === "remediated" || e.lifecycle === "verified",
    ).length;
    const riskScore = fleetRiskScore(driftEvents);
    valueRecap = {
      openFindings,
      highSevFindings,
      remediatedFindings,
      fleetRiskScore: riskScore,
      fleetRiskPriority: riskPriorityFromScore(riskScore),
    };

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
      valueRecap={valueRecap}
    />
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SandboxBanner />
      </Suspense>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardDeferred />
      </Suspense>
    </AppShell>
  );
}
