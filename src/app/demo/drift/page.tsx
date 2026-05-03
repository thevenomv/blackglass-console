import { DEMO_DRIFT, DEMO_SSH_CHECKS } from "@/lib/demo/seed";
import { DemoGateButton } from "@/components/demo/DemoGateButton";

export default function DemoDriftPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">Findings</h1>
          <p className="mt-1 text-sm text-fg-muted">Drift + policy deltas versus frozen baselines.</p>
        </div>
        <DemoGateButton actionLabel="Acknowledge finding">Bulk acknowledge</DemoGateButton>
      </div>
      <section className="rounded-card border border-border-default bg-bg-panel p-4">
        <h2 className="text-sm font-semibold text-fg-primary">SSH &amp; configuration</h2>
        <ul className="mt-3 divide-y divide-border-subtle">
          {DEMO_SSH_CHECKS.map((c) => (
            <li key={c.hostId + c.check} className="flex flex-wrap gap-2 py-3 text-sm">
              <span className="font-mono text-xs text-fg-faint">{c.hostId}</span>
              <span className="font-medium text-fg-primary">{c.check}</span>
              <span
                className={
                  c.status === "pass"
                    ? "text-emerald-400"
                    : c.status === "warn"
                      ? "text-amber-400"
                      : "text-red-400"
                }
              >
                {c.status}
              </span>
              <span className="text-fg-muted">{c.detail}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-card border border-border-default bg-bg-panel p-4">
        <h2 className="text-sm font-semibold text-fg-primary">Drift queue</h2>
        <ul className="mt-3 space-y-2">
          {DEMO_DRIFT.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-1 rounded-md border border-border-subtle px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm text-fg-primary">{d.title}</p>
                <p className="text-xs text-fg-faint">
                  {d.category} · {d.lifecycle} · {d.detectedAt}
                </p>
              </div>
              <span className="font-mono text-xs uppercase text-amber-400">{d.severity}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
