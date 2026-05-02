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

const PERSONAS = [
  {
    title: "SOC analyst",
    intent: "Prioritize noisy listeners and identity deltas.",
    links: [
      { href: "/drift", label: "Drift queue" },
      { href: "/hosts/host-07", label: "Hot host host-07" },
      { href: "/", label: "Fleet dashboard" },
    ],
  },
  {
    title: "SRE / platform",
    intent: "Verify baselines after change windows and scan coverage.",
    links: [
      { href: "/baselines", label: "Baseline diff" },
      { href: "/hosts", label: "Hosts inventory" },
      { href: "/demo", label: "Reload this script" },
    ],
  },
  {
    title: "Auditor",
    intent: "Read-only drift review and evidence exports.",
    links: [
      { href: "/evidence", label: "Evidence bundles" },
      { href: "/reports", label: "Reports" },
      { href: "/login", label: "Sign in" },
    ],
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
            engineers will extend against real collectors. Use{" "}
            <kbd className="rounded border border-border-subtle px-1 font-mono text-[11px]">⌘K</kbd>{" "}
            for quick navigation anywhere.
          </p>
        </div>

        <section aria-labelledby="personas-heading">
          <h2 id="personas-heading" className="text-sm font-semibold text-fg-primary">
            Guided entry points
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {PERSONAS.map((p) => (
              <div
                key={p.title}
                className="rounded-card border border-border-default bg-bg-panel px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-blue">
                  {p.title}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-fg-muted">{p.intent}</p>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {p.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="font-medium text-accent-blue hover:underline">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

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
            Sign in
          </Link>
        </div>

        <section aria-labelledby="presets-heading" className="border-t border-border-subtle pt-8">
          <h2 id="presets-heading" className="text-sm font-semibold text-fg-primary">
            Deep-link presets
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Bookmarkable queries aligned with drift lifecycle filters and demo flows.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            <li>
              <Link
                href="/drift?severity=high&lifecycle=new"
                className="rounded-full border border-border-default px-3 py-1 font-medium text-accent-blue hover:bg-bg-elevated"
              >
                High + new findings
              </Link>
            </li>
            <li>
              <Link
                href="/drift?host=host-07&event=d-001"
                className="rounded-full border border-border-default px-3 py-1 font-medium text-accent-blue hover:bg-bg-elevated"
              >
                host-07 · TCP listener drawer
              </Link>
            </li>
            <li>
              <Link
                href="/workspace"
                className="rounded-full border border-border-default px-3 py-1 font-medium text-accent-blue hover:bg-bg-elevated"
              >
                Incident workspace (INC-2047)
              </Link>
            </li>
            <li>
              <Link
                href="/baselines?host=host-07"
                className="rounded-full border border-border-default px-3 py-1 font-medium text-accent-blue hover:bg-bg-elevated"
              >
                Baseline diff · host-07
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
