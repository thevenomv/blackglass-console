import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardV3 } from "./_components/DashboardV3";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { FetchFailed } from "@/components/ui/FetchFailed";
import Link from "next/link";
import { fetchFleetPageData } from "@/lib/api/fleet";
import { fetchHosts } from "@/lib/api/hosts";
import { baselineStoreHealth, listBaselineHostIds } from "@/lib/server/baseline-store";
import { collectorConfigured } from "@/lib/server/collector";
import { isSampleDataEnabled } from "@/lib/server/sample-data";
import { deriveDriftCardsFromEvents, pickSpotlightHost } from "@/lib/server/dashboard-context";
import { resolveDriftEventsForDashboardAsync } from "@/lib/server/drift-resolve";
import { fleetRiskScore, riskPriorityFromScore } from "@/lib/server/risk-score";
import type { HostRecord } from "@/data/mock/types";
import { loadHosts } from "@/lib/server/inventory";
import { SandboxBanner } from "@/components/sandbox/SandboxBanner";
import type { ValueRecap } from "./_components/ValueRecapBanner";

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
  let onboardingState: {
    hostConnected: boolean;
    baselineCaptured: boolean;
    scanRun: boolean;
  };
  let policyFailureHostCount = 0;
  let latestSignalAt: string | null = null;

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

    const collectorHostsForFreshness = collectorOn ? await loadHosts() : [];
    let sh = (collectorOn ? pickSpotlightHost(collectorHostsForFreshness) : null) ?? null;
    if (liveMode && !sh) {
      sh = pickSpotlightHost((await fetchHosts()).items);
    }
    spotlightHost = sh;

    // Compute the freshest "we heard from somewhere" timestamp across
    // the collector-known fleet. Drives the snapshot-age pill next to
    // the Run scan button — see SnapshotFreshnessPill.tsx for why it
    // exists. We only set this when the collector is on; in pure
    // sample-data mode the timestamps are mock and would mislead.
    if (collectorOn && collectorHostsForFreshness.length > 0) {
      let latestMs = 0;
      for (const h of collectorHostsForFreshness) {
        if (!h.lastScanAt) continue;
        const t = Date.parse(h.lastScanAt);
        if (Number.isFinite(t) && t > latestMs) latestMs = t;
      }
      if (latestMs > 0) latestSignalAt = new Date(latestMs).toISOString();
    }

    const derived = liveMode
      ? deriveDriftCardsFromEvents(driftEvents, spotlightHost)
      : { driftTopCategories: [], recommendedActionHostId: null };
    driftTopCategories = derived.driftTopCategories;

    ctaHostId =
      derived.recommendedActionHostId ??
      fleet.notableEvents[0]?.hostId ??
      spotlightHost?.id ??
      null;

    // Drive the onboarding checklist's auto-detected steps. `hostConnected`
    // covers both the env-var collector path and the saas-managed hosts table
    // (collectorConfigured() handles both); `baselineCaptured` is true once at
    // least one baseline exists in the store; `scanRun` is true once any
    // host has been scanned (fleet.hostsChecked > 0).
    const baselineHostIds = collectorOn ? await listBaselineHostIds() : [];
    onboardingState = {
      hostConnected: collectorOn,
      baselineCaptured: baselineHostIds.length > 0,
      scanRun: fleet.hostsChecked > 0,
    };

    // Compute distinct hosts with an unresolved policy_failure synthetic
    // event so the SystemStatusBanner can fail closed: a missing policy
    // signal must surface as a danger banner, not silently disappear.
    policyFailureHostCount = new Set(
      driftEvents
        .filter(
          (e) =>
            e.category === "policy_failure" &&
            (e.lifecycle === "new" || e.lifecycle === "triaged"),
        )
        .map((e) => e.hostId),
    ).size;
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
      onboardingState={onboardingState}
      policyFailureHostCount={policyFailureHostCount}
      latestSignalAt={latestSignalAt}
    />
  );
}

async function SampleDataBanner() {
  const enabled = await isSampleDataEnabled();
  if (!enabled) return null;
  return (
    <div
      role="region"
      aria-label="Sample data active"
      className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-warning/40 bg-warning-soft/25 px-4 py-2.5 text-sm text-fg-muted"
    >
      <p>
        <strong className="font-semibold text-fg-primary">Sample data view</strong>{" "}
        — you&apos;re looking at a pre-built demo fleet, not your real data.
      </p>
      <Link
        href="/settings"
        className="rounded-md border border-border-default bg-bg-panel px-2.5 py-1 text-xs font-medium text-fg-primary transition-colors hover:border-border-strong"
      >
        Disable in Settings
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SandboxBanner />
      </Suspense>
      <Suspense fallback={null}>
        <SampleDataBanner />
      </Suspense>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardDeferred />
      </Suspense>
    </AppShell>
  );
}
