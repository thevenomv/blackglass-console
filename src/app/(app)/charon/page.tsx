import { AppShell } from "@/components/layout/AppShell";
import { JanitorConsole } from "@/components/janitor/JanitorConsole";

export const dynamic = "force-dynamic";

/** Charon cloud console — follows global light/dark theme (no forced light surface). */
export default function CharonPage() {
  return (
    <AppShell>
      <div className="min-h-full flex-1 bg-bg-base">
        <JanitorConsole />
      </div>
    </AppShell>
  );
}
