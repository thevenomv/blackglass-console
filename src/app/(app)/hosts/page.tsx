export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { HostsView } from "./_components/HostsView";
import { TableSkeletonRows } from "@/components/ui/Skeleton";
import { FetchFailed } from "@/components/ui/FetchFailed";
import { fetchHosts } from "@/lib/api/hosts";
import { Suspense } from "react";

async function HostsBody() {
  let result: Awaited<ReturnType<typeof fetchHosts>>;
  try {
    result = await fetchHosts();
  } catch {
    return (
      <FetchFailed
        title="Host inventory unavailable"
        description="Verify collector configuration in Settings."
      />
    );
  }
  return <HostsView hosts={result.items} atCap={result.atCap} hostCap={result.hostCap} />;
}

export default function HostsPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="px-6 pb-10 pt-6">
            <TableSkeletonRows rows={8} />
          </div>
        }
      >
        <HostsBody />
      </Suspense>
    </AppShell>
  );
}
