import { AppShell } from "@/components/layout/AppShell";
import { HostsView } from "@/components/hosts/HostsView";
import { TableSkeletonRows } from "@/components/ui/Skeleton";
import { FetchFailed } from "@/components/ui/FetchFailed";
import { fetchHosts } from "@/lib/api/hosts";
import { Suspense } from "react";

async function HostsBody() {
  try {
    const hosts = await fetchHosts();
    return <HostsView hosts={hosts} />;
  } catch {
    return (
      <FetchFailed
        title="Host inventory unavailable"
        description="Verify NEXT_PUBLIC_API_URL or disable mock mode after backend readiness checks."
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
