import Link from "next/link";
import { DEMO_AUDIT, DEMO_DRIFT, DEMO_HOSTS, DEMO_REMEDIATIONS } from "@/lib/demo/seed";
import { DemoGateButton } from "@/components/demo/DemoGateButton";

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

  /** Shared control surface — full-width cells in a 2×2 grid so labels can wrap cleanly. */
  const outlineControl =
    "inline-flex min-h-[2.75rem] w-full items-center justify-center rounded-card border border-border-default bg-bg-panel px-3 py-2 text-center text-sm font-medium leading-snug text-fg-primary transition-colors hover:border-accent-blue/35 hover:bg-bg-elevated";
  return (
    <div className="space-y-8">
      <div className="rounded-card border border-border-subtle bg-bg-panel/50 p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-blue">Blackglass</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg-primary">At a glance</h1>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Sample health indicators for a fictional Linux fleet — for illustration only. Nothing here connects to
              your infrastructure.
            </p>
          </div>
          <div className="flex w-full flex-col gap-5 lg:ml-auto lg:max-w-md">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">
                Demo actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                <DemoGateButton actionLabel="Run fleet scan" className={outlineControl}>
                  Run scan
                </DemoGateButton>
                <DemoGateButton actionLabel="Capture baseline" className={outlineControl}>
                  Capture baseline
                </DemoGateButton>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">
                Sample exports
              </p>
              <div className="grid grid-cols-2 gap-2">
                <a href="/api/public/demo-evidence" download className={outlineControl}>
                  Integrity evidence (PDF)
                </a>
                <a href="/api/public/demo-evidence?format=json" download className={outlineControl}>
                  Evidence (JSON)
                </a>
                <a href="/api/public/demo-report" download className={outlineControl}>
                  Sample report (PDF)
                </a>
                <a href="/api/public/demo-report?format=json" download className={outlineControl}>
                  Report (JSON)
                </a>
              </div>
            </div>
          </div>
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
          <h2 className="text-sm font-semibold text-fg-primary">Recent findings</h2>
          <ul className="mt-3 divide-y divide-border-subtle text-sm">
            {DEMO_DRIFT.slice(0, 4).map((d) => (
              <li key={d.id} className="flex gap-3 py-2.5">
                <span className={`shrink-0 text-xs font-semibold capitalize ${sevColor(d.severity)}`}>
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
                <span className="shrink-0 text-[10px] font-medium capitalize text-fg-faint">
                  {r.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-card border border-border-default bg-bg-panel p-4">
        <h2 className="text-sm font-semibold text-fg-primary">Audit tail (sample)</h2>
        <ul className="mt-3 text-xs text-fg-muted">
          {DEMO_AUDIT.map((a) => (
            <li key={a.at + a.action} className="border-b border-border-subtle py-2 last:border-0">
              <span className="text-fg-faint">{a.at}</span> · {a.actor} · {a.action} — {a.detail}
            </li>
          ))}
        </ul>
      </section>

      {/* Example scenarios callout */}
      <Link
        href="/demo/sandbox"
        className="group flex items-center justify-between gap-4 rounded-card border border-accent-blue/30 bg-accent-blue/5 px-5 py-4 transition-colors hover:bg-accent-blue/10"
      >
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-blue" />
          <div>
            <p className="text-sm font-semibold text-fg-primary">Eight example scenarios, walked through</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              The exact severity, rationale, and remediation Blackglass surfaces for each scenario — backdoor listeners, sudoers tampering, rogue users, sshd policy changes, cron beacons, planted SUID, and more.
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium text-accent-blue group-hover:underline">Read walkthrough →</span>
      </Link>
    </div>
  );
}
