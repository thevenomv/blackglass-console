import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceConsole } from "@/components/workspace/WorkspaceConsole";
import { getHostDetail } from "@/data/mock/hosts";
import { loadHostDetail } from "@/lib/server/inventory";

interface WorkspaceSearchParams {
  incident?: string;
  host?: string;
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
  const real = await loadHostDetail(hostId);
  const timeline = real?.timeline ?? getHostDetail(hostId)?.timeline ?? [];

  return (
    <AppShell>
      <WorkspaceConsole incidentId={incidentId} hostId={hostId} timeline={timeline} />
    </AppShell>
  );
}
