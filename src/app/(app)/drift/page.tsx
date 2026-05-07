export const dynamic = "force-dynamic";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { DriftEventsView } from "./_components/DriftEventsView";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeletonRows } from "@/components/ui/Skeleton";
import { RunScanButton } from "@/app/(app)/dashboard/_components/RunScanButton";
import { apiConfig } from "@/lib/api/config";
import { driftEvents as mockDriftEvents } from "@/data/mock/drift";
import { collectorConfigured } from "@/lib/server/collector";
import { getDriftEventsAsync } from "@/lib/server/drift-engine";
import { Suspense } from "react";

async function DriftBody({ eventId }: { eventId?: string }) {
  const live = collectorConfigured();
  const events = apiConfig.useMock && !live ? mockDriftEvents : await getDriftEventsAsync();
  const selected = eventId ? events.find((e) => e.id === eventId) : undefined;

  // Zero-state branch: no data yet at all. Bypass the filter UI entirely
  // and route the operator to the next concrete action.
  if (events.length === 0 && !selected) {
    return (
      <div className="flex flex-col gap-6 px-6 pb-10 pt-6">
        <PageHeader
          title="Drift"
          subtitle="High-signal deltas grouped by integrity class — open an event to investigate."
          breadcrumbs={[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/drift", label: "Drift" },
          ]}
          actions={live ? <RunScanButton /> : undefined}
        />
        <EmptyState
          title={live ? "No drift detected yet" : "Connect a host to see drift"}
          description={
            live
              ? "Drift events appear here after the first scan that finds a difference between the captured baseline and live host state. Capture a baseline first if you haven't already, then run a scan."
              : "BLACKGLASS compares each scan to a captured baseline and surfaces deviations here. Connect a Linux host to start collecting state."
          }
          action={
            live ? (
              <div className="flex flex-wrap gap-2">
                <RunScanButton />
                <Link
                  href="/baselines"
                  className="inline-flex h-9 items-center justify-center rounded-card border border-border-default px-4 text-sm font-medium text-fg-muted transition-colors hover:text-fg-primary"
                >
                  Capture baseline
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex h-9 items-center justify-center rounded-card border border-border-default px-4 text-sm font-medium text-fg-muted transition-colors hover:text-fg-primary"
                >
                  Explore the demo
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/onboarding"
                  className="inline-flex h-9 items-center justify-center rounded-card bg-accent-blue px-4 text-sm font-medium text-white hover:bg-accent-blue-hover"
                >
                  Run setup wizard
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex h-9 items-center justify-center rounded-card border border-border-default px-4 text-sm font-medium text-fg-muted transition-colors hover:text-fg-primary"
                >
                  Explore the demo
                </Link>
              </div>
            )
          }
        />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="px-6 pb-10 pt-6">
          <TableSkeletonRows rows={8} />
        </div>
      }
    >
      <DriftEventsView events={events} selected={selected} />
    </Suspense>
  );
}

export default async function DriftPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const { event } = await searchParams;

  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="px-6 pb-10 pt-6">
            <TableSkeletonRows rows={8} />
          </div>
        }
      >
        <DriftBody eventId={event} />
      </Suspense>
    </AppShell>
  );
}
