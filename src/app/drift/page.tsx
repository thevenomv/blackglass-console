import { AppShell } from "@/components/layout/AppShell";
import { DriftEventsView } from "@/components/drift/DriftEventsView";
import { TableSkeletonRows } from "@/components/ui/Skeleton";
import { driftEvents, getDriftEvent } from "@/data/mock/drift";
import { mockLatency } from "@/lib/mockLatency";
import { Suspense } from "react";

async function DriftBody({ eventId }: { eventId?: string }) {
  await mockLatency(240);
  const selected = eventId ? getDriftEvent(eventId) : undefined;
  return <DriftEventsView events={driftEvents} selected={selected} />;
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
