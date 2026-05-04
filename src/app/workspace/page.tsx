export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceConsole } from "@/components/workspace/WorkspaceConsole";
import { getHostDetail } from "@/data/mock/hosts";
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
  const incidentId = params.incident ?? "INC-2047";
  const live = collectorConfigured();

  // When collector is configured, only use real data (no mock fallback).
  // When not configured (demo mode), fall back to host-07 mock.
  const hostId = params.host ?? (live ? null : "host-07");

  let timeline: NonNullable<Awaited<ReturnType<typeof loadHostDetail>>>["timeline"] | [] = [];
  if (hostId) {
    const real = await loadHostDetail(hostId).catch(() => null);
    timeline = real?.timeline ?? (live ? [] : getHostDetail(hostId)?.timeline ?? []);
  }

  return (
    <AppShell>
      <Suspense fallback={<WorkspaceLoading />}>
        <WorkspaceConsole incidentId={incidentId} hostId={hostId ?? ""} timeline={timeline} />
      </Suspense>
    </AppShell>
  );
}
