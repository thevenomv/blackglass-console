import { DEMO_DRIFT } from "@/lib/demo/seed";

export default function DemoTimelinePage() {
  const sorted = [...DEMO_DRIFT].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-fg-primary">Drift timeline</h1>
      <p className="text-sm text-fg-muted">
        Synthetic ordering for narrative — production uses immutable audit + finding history.
      </p>
      <ol className="relative border-l border-border-subtle pl-6">
        {sorted.map((d) => (
          <li key={d.id} className="mb-6 ml-1">
            <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-accent-blue" />
            <time className="font-mono text-xs text-fg-faint">{d.detectedAt}</time>
            <p className="mt-1 text-sm font-medium text-fg-primary">{d.title}</p>
            <p className="text-xs text-fg-muted">
              {d.hostId} · {d.severity}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
