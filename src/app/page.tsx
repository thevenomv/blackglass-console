import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardV3 } from "@/components/dashboard/DashboardV3";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { FetchFailed } from "@/components/ui/FetchFailed";
import { fetchFleetSnapshot } from "@/lib/api/fleet";

// Dashboard always needs live data — skip static prerender.
export const dynamic = "force-dynamic";

async function DashboardDeferred() {
  try {
    const fleet = await fetchFleetSnapshot();
    return <DashboardV3 fleet={fleet} />;
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
