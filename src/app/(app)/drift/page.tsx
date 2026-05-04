export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { DriftEventsView } from "./_components/DriftEventsView";
import { TableSkeletonRows } from "@/components/ui/Skeleton";
import { apiConfig } from "@/lib/api/config";
import { driftEvents as mockDriftEvents } from "@/data/mock/drift";
import { collectorConfigured } from "@/lib/server/collector";
import { getDriftEvents } from "@/lib/server/drift-engine";
import { Suspense } from "react";

async function DriftBody({ eventId }: { eventId?: string }) {
  const live = collectorConfigured();
  const events = apiConfig.useMock && !live ? mockDriftEvents : getDriftEvents();
  const selected = eventId ? events.find((e) => e.id === eventId) : undefined;
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
