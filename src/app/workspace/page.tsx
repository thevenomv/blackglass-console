export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceConsole } from "@/components/workspace/WorkspaceConsole";
import { getHostDetail } from "@/data/mock/hosts";
import { loadHostDetail } from "@/lib/server/inventory";

interface WorkspaceSearchParams {
  incident?: string;
  host?: string;
}

function WorkspaceLoading() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <span className="text-sm text-fg-muted">Loading workspace…</span>
    </div>
  );
}

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<WorkspaceSearchParams>;
}) {
  const params = await searchParams;
  const incidentId = params.incident ?? "INC-2047";
  const hostId = params.host ?? "host-07";

  // Prefer real data; fall back to mock for demo mode.
  const real = await loadHostDetail(hostId).catch(() => null);
  const timeline = real?.timeline ?? getHostDetail(hostId)?.timeline ?? [];

  return (
    <AppShell>
      <Suspense fallback={<WorkspaceLoading />}>
        <WorkspaceConsole incidentId={incidentId} hostId={hostId} timeline={timeline} />
      </Suspense>
    </AppShell>
  );
}
