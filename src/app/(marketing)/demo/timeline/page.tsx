import { DEMO_DRIFT, DEMO_HOSTS } from "@/lib/demo/seed";

function hostLabel(hostId: string) {
  return DEMO_HOSTS.find((h) => h.id === hostId)?.name ?? hostId;
}

export default function DemoTimelinePage() {
  const sorted = [...DEMO_DRIFT].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-fg-primary">Activity timeline</h1>
      <p className="text-sm text-fg-muted">
        Order shown for clarity. In a live workspace every finding stays tied to the audit history.
      </p>
      <ol className="relative border-l border-border-subtle pl-6">
        {sorted.map((d) => (
          <li key={d.id} className="mb-6 ml-1">
            <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-accent-blue" />
            <time className="text-xs text-fg-faint">{d.detectedAt}</time>
            <p className="mt-1 text-sm font-medium text-fg-primary">{d.title}</p>
            <p className="text-xs text-fg-muted">
              {hostLabel(d.hostId)} · <span className="capitalize">{d.severity}</span>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
