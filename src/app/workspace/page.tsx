import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceConsole } from "@/components/workspace/WorkspaceConsole";
import { getHostDetail } from "@/data/mock/hosts";

export default function WorkspacePage() {
  const detail = getHostDetail("host-07");
  const timeline = detail?.timeline ?? [];

  return (
    <AppShell>
      <WorkspaceConsole incidentId="INC-2047" hostId="host-07" timeline={timeline} />
    </AppShell>
  );
}
