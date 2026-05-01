import { AppShell } from "@/components/layout/AppShell";
import Link from "next/link";

const STEPS = [
  {
    title: "Establish baseline",
    detail: "Pin an approved snapshot after change freeze — /baselines · /onboarding.",
  },
  {
    title: "Run fleet integrity scan",
    detail: "Use Run scan — routes through POST /api/v1/scans with live polling when mock mode is off.",
  },
  {
    title: "Triage drift",
    detail: "Open /drift, investigate drawer, acknowledge or approve with operator/admin roles.",
  },
  {
    title: "Export evidence",
    detail: "Evidence meta + artifact stubs under /api/v1/evidence/bundles/:id (+ /file).",
  },
];

export default function DemoPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">Field narrative</p>
          <h1 className="mt-2 text-xl font-semibold text-fg-primary">Partner demo script</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Four-stop flow for design partners — links jump straight into the console surfaces that
            engineers will extend against real collectors.
          </p>
        </div>

        <ol className="space-y-5">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="rounded-card border border-border-default bg-bg-panel px-5 py-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-blue">
                Step {i + 1}
              </p>
              <p className="mt-2 text-sm font-semibold text-fg-primary">{s.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.detail}</p>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/onboarding"
            className="rounded-card border border-border-default px-4 py-2 text-sm font-medium text-accent-blue hover:bg-bg-elevated"
          >
            Open onboarding
          </Link>
          <Link
            href="/hosts/host-07"
            className="rounded-card border border-border-default px-4 py-2 text-sm font-medium text-accent-blue hover:bg-bg-elevated"
          >
            Seed host investigation
          </Link>
          <Link
            href="/login"
            className="rounded-card border border-border-default px-4 py-2 text-sm font-medium text-accent-blue hover:bg-bg-elevated"
          >
            Role picker (login stub)
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
