import Link from "next/link";
import { DEMO_AUDIT, DEMO_DRIFT, DEMO_HOSTS, DEMO_REMEDIATIONS } from "@/lib/demo/seed";
import { DemoGateButton, TrialSignupLink } from "@/components/demo/DemoGateButton";

function sevColor(s: string) {
  switch (s) {
    case "critical":
      return "text-red-400";
    case "high":
      return "text-orange-400";
    case "medium":
      return "text-amber-300";
    default:
      return "text-fg-muted";
  }
}

export default function DemoOverviewPage() {
  const openDrift = DEMO_DRIFT.filter((d) => d.lifecycle === "new").length;
  const fails = DEMO_HOSTS.filter((h) => h.sshHardening === "fail").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">Fleet overview</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Integrity posture across Linux SSH targets — sample KPIs only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DemoGateButton actionLabel="Run fleet scan">Run scan</DemoGateButton>
          <DemoGateButton actionLabel="Capture baseline">Capture baseline</DemoGateButton>
          <TrialSignupLink className="rounded-card border border-accent-blue/50 px-3 py-2 text-sm font-medium text-accent-blue hover:bg-accent-blue/10">
            Start free trial
          </TrialSignupLink>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { k: "Hosts", v: String(DEMO_HOSTS.length), d: "Imported / connected" },
          { k: "Open findings", v: String(openDrift), d: "New + acknowledged" },
          { k: "SSH hardening fails", v: String(fails), d: "vs last baseline" },
          { k: "Remediation items", v: String(DEMO_REMEDIATIONS.length), d: "tracked actions" },
        ].map((x) => (
          <div
            key={x.k}
            className="rounded-card border border-border-default bg-bg-panel px-4 py-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-faint">{x.k}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-fg-primary">{x.v}</p>
            <p className="mt-0.5 text-xs text-fg-faint">{x.d}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-border-default bg-bg-panel p-4">
          <h2 className="text-sm font-semibold text-fg-primary">Recent drift</h2>
          <ul className="mt-3 divide-y divide-border-subtle text-sm">
            {DEMO_DRIFT.slice(0, 4).map((d) => (
              <li key={d.id} className="flex gap-3 py-2.5">
                <span className={`shrink-0 font-mono text-xs ${sevColor(d.severity)}`}>
                  {d.severity}
                </span>
                <span className="text-fg-muted">{d.title}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-card border border-border-default bg-bg-panel p-4">
          <h2 className="text-sm font-semibold text-fg-primary">Remediation queue</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {DEMO_REMEDIATIONS.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border-subtle px-3 py-2"
              >
                <span className="text-fg-muted">{r.title}</span>
                <span className="shrink-0 font-mono text-[10px] uppercase text-fg-faint">
                  {r.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-card border border-border-default bg-bg-panel p-4">
        <h2 className="text-sm font-semibold text-fg-primary">Audit tail (sample)</h2>
        <ul className="mt-3 font-mono text-xs text-fg-muted">
          {DEMO_AUDIT.map((a) => (
            <li key={a.at + a.action} className="border-b border-border-subtle py-2 last:border-0">
              <span className="text-fg-faint">{a.at}</span> · {a.actor} · {a.action} — {a.detail}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
