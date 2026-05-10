import { AppShell } from "@/components/layout/AppShell";
import { JanitorConsole } from "@/components/janitor/JanitorConsole";

export const dynamic = "force-dynamic";

export default function JanitorPage() {
  return (
    <AppShell>
      <div className="charon-surface min-h-full flex-1 bg-bg-base">
        <JanitorConsole />
      </div>
    </AppShell>
  );
}
