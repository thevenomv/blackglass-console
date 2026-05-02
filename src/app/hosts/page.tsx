import { AppShell } from "@/components/layout/AppShell";
import { HostsView } from "@/components/hosts/HostsView";
import { TableSkeletonRows } from "@/components/ui/Skeleton";
import { FetchFailed } from "@/components/ui/FetchFailed";
import { fetchHosts } from "@/lib/api/hosts";
import { Suspense } from "react";

async function HostsBody() {
  try {
    const result = await fetchHosts();
    return <HostsView hosts={result.items} atCap={result.atCap} hostCap={result.hostCap} />;
  } catch {
    return (
      <FetchFailed
        title="Host inventory unavailable"
        description="Verify collector configuration in Settings."
      />
    );
  }
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
