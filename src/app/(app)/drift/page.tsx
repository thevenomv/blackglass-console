export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RunScanButton } from "@/app/(app)/dashboard/_components/RunScanButton";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeletonRows } from "@/components/ui/Skeleton";
import { driftEvents as mockDriftEvents } from "@/data/mock/drift";
import { apiConfig } from "@/lib/api/config";
import { collectorConfigured } from "@/lib/server/collector";
import { getDriftEventsAsync } from "@/lib/server/drift-engine";
import { DriftEventsView } from "./_components/DriftEventsView";

export const metadata: Metadata = {
  title: "Findings",
  description:
    "Review changes compared with your trusted baseline — filter, triage, and open detail for each finding.",
};

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
          title="Findings"
          subtitle="Changes compared with your trusted snapshot — open any row for context and next steps."
          breadcrumbs={[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/drift", label: "Findings" },
          ]}
          actions={live ? <RunScanButton /> : undefined}
        />
        <EmptyState
          title={live ? "No findings yet" : "Connect a host to see findings"}
          description={
            live
              ? "Items appear after a scan finds a difference between your trusted snapshot and the live server. Capture a snapshot first if you have not already, then run a scan."
              : "Blackglass compares each check to your trusted snapshot and lists differences here. Connect a Linux host to get started."
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
