export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceConsole } from "./_components/WorkspaceConsole";
import { collectorConfigured } from "@/lib/server/collector";
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
  const incidentId = params.incident ?? "";
  const hostId = params.host ?? "";

  let timeline: NonNullable<Awaited<ReturnType<typeof loadHostDetail>>>["timeline"] | [] = [];
  if (hostId && collectorConfigured()) {
    const real = await loadHostDetail(hostId).catch(() => null);
    timeline = real?.timeline ?? [];
  }

  return (
    <AppShell>
      <Suspense fallback={<WorkspaceLoading />}>
        <WorkspaceConsole incidentId={incidentId || "—"} hostId={hostId} timeline={timeline} />
      </Suspense>
    </AppShell>
  );
}
