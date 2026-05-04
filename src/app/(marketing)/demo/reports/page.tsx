import { DemoGateButton } from "@/components/demo/DemoGateButton";

const REPORTS = [
  {
    id: "rpt-1",
    title: "Weekly SSH hardening posture",
    generated: "2026-05-02",
    summary: "2 failures, 4 warnings across 10 hosts — jump host root login flagged.",
  },
  {
    id: "rpt-2",
    title: "CIS Linux L1 delta",
    generated: "2026-05-01",
    summary: "sysctl + sshd_config drifts concentrated on legacy-monolith-01.",
  },
  {
    id: "rpt-3",
    title: "Listener surface export",
    generated: "2026-04-30",
    summary: "New bind on batch-worker-03:9200 correlated with deployment tag 19.4.2.",
  },
];

export default function DemoReportsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-fg-primary">Reports</h1>
        <DemoGateButton actionLabel="Generate report">New report</DemoGateButton>
      </div>
      <ul className="space-y-3">
        {REPORTS.map((r) => (
          <li
            key={r.id}
            className="rounded-card border border-border-default bg-bg-panel px-4 py-3 transition-colors hover:border-border-subtle"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg-primary">{r.title}</h2>
              <time className="font-mono text-xs text-fg-faint">{r.generated}</time>
            </div>
            <p className="mt-2 text-sm text-fg-muted">{r.summary}</p>
            <DemoGateButton
              actionLabel="Export report"
              className="mt-3 text-xs font-medium text-accent-blue hover:underline"
            >
              Export PDF (sample)
            </DemoGateButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
