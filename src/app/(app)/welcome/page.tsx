import Link from "next/link";
export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/AppShell";
import { collectorConfigured } from "@/lib/server/collector";
import { baselineStoreHealth } from "@/lib/server/baseline-store";
import { GenerateInviteButton } from "@/components/auth/GenerateInviteButton";

export const metadata = {
  title: "Get started | BLACKGLASS",
};

const FEATURES = [
  {
    label: "SSH-based collection",
    detail: "No agent install. Read-only SSH commands gather live state from any Linux host.",
  },
  {
    label: "Baseline anchoring",
    detail: "Snapshot approved system state after a change freeze. Every future scan diffs against it.",
  },
  {
    label: "Drift engine",
    detail:
      "Structured, severity-ranked drift across listeners, users, SSH posture, firewall rules, packages, and kernel.",
  },
  {
    label: "Evidence bundles",
    detail:
      "Export signed evidence packets for audit, incident response, or compliance questionnaires.",
  },
  {
    label: "Fleet radar",
    detail:
      "Cross-host risk aggregation — surfaces the host that most needs attention without noise.",
  },
  {
    label: "Persistent state",
    detail:
      "Baselines and drift history stored to DigitalOcean Spaces — survive process restarts and redeployments.",
  },
] as const;

function CheckIcon({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
          <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-default text-fg-faint">
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    </span>
  );
}

export default function WelcomePage() {
  const collectorOn = collectorConfigured();
  const baseline = baselineStoreHealth();

  const setupSteps = [
    {
      label: "Collector connected",
      done: collectorOn,
      cta: { href: "/settings", text: "Configure in Settings" },
      detail: collectorOn
        ? "At least one COLLECTOR_HOST_N is configured."
        : "Set COLLECTOR_HOST_1 + SSH_PRIVATE_KEY in your environment.",
    },
    {
      label: "Baseline persistence",
      done: baseline.configured && baseline.writable !== false,
      cta: { href: "/settings", text: "View runtime health" },
      detail:
        baseline.configured && baseline.writable !== false
          ? "DO Spaces adapter active — baselines survive restarts."
          : "Set DO_SPACES_* env vars or BASELINE_STORE_PATH for persistence.",
    },
    {
      label: "First baseline captured",
      done: false, // server-side baseline count would need DB — flag as manual
      cta: { href: "/baselines", text: "Go to Baselines" },
      detail: "Run a scan, then pin the resulting snapshot as your baseline anchor.",
    },
  ];

  const allDone = setupSteps.every((s) => s.done);

  return (
    <AppShell>
      <div className="mx-auto flex max-w-[860px] flex-col gap-10 px-6 pb-20 pt-10">
        {/* Header */}
        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-fg-faint">
            BLACKGLASS · Obsidian Dynamics Limited
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-fg-primary">
            Operational integrity for Linux hosts
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg-muted">
            BLACKGLASS compares live system state to an approved baseline — surfacing drift that
            commonly precedes incidents. No agents. No noise. High signal.
          </p>
        </div>

        {/* Setup checklist */}
        <section aria-labelledby="setup-heading">
          <h2
            id="setup-heading"
            className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-fg-faint"
          >
            Setup status
          </h2>
          <div className="divide-y divide-border-subtle rounded-card border border-border-default bg-bg-panel">
            {setupSteps.map((step) => (
              <div key={step.label} className="flex items-start gap-3 px-4 py-3.5">
                <CheckIcon ok={step.done} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg-primary">{step.label}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{step.detail}</p>
                </div>
                {!step.done && (
                  <Link
                    href={step.cta.href}
                    className="shrink-0 rounded-md border border-border-default px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent-blue hover:text-accent-blue"
                  >
                    {step.cta.text}
                  </Link>
                )}
              </div>
            ))}
          </div>

          {allDone ? (
            <div className="mt-3 rounded-card border border-success/40 bg-success-soft/25 px-4 py-3 text-sm text-fg-muted">
              All systems configured —{" "}
              <Link href="/dashboard" className="font-medium text-accent-blue hover:underline">
                go to the fleet dashboard
              </Link>
              .
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/onboarding"
                className="inline-flex h-8 items-center rounded-md bg-accent-blue px-3 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                Run setup wizard
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-8 items-center rounded-md border border-border-default px-3 text-xs text-fg-muted transition-colors hover:text-fg-primary"
              >
                Skip to dashboard
              </Link>
            </div>
          )}
        </section>

        {/* Features grid */}
        <section aria-labelledby="features-heading">
          <h2
            id="features-heading"
            className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-fg-faint"
          >
            What BLACKGLASS covers
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.label}
                className="rounded-card border border-border-subtle bg-bg-panel px-4 py-3"
              >
                <p className="text-sm font-medium text-fg-primary">{f.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-fg-muted">{f.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick nav */}
        <section aria-labelledby="nav-heading">
          <h2
            id="nav-heading"
            className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-fg-faint"
          >
            Jump to
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/hosts", label: "Hosts", sub: "Inventory + per-host state" },
              { href: "/baselines", label: "Baselines", sub: "Capture & manage anchors" },
              { href: "/drift", label: "Drift", sub: "All detected deviations" },
              { href: "/evidence", label: "Evidence", sub: "Export audit bundles" },
              { href: "/reports", label: "Reports", sub: "Compliance summaries" },
              { href: "/settings", label: "Settings", sub: "Runtime health + secrets" },
              { href: "/demo", label: "Demo", sub: "Explore with sample data" },
              { href: "/onboarding", label: "Setup wizard", sub: "Step-by-step first run" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex flex-col rounded-card border border-border-subtle bg-bg-panel px-3 py-2.5 transition-colors hover:border-accent-blue/50 hover:bg-bg-elevated"
              >
                <span className="text-sm font-medium text-fg-primary group-hover:text-accent-blue">
                  {item.label}
                </span>
                <span className="mt-0.5 text-xs text-fg-faint">{item.sub}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Docs footer */}
        <section aria-labelledby="invite-heading">
          <h2
            id="invite-heading"
            className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-fg-faint"
          >
            Invite a customer
          </h2>
          <div className="rounded-card border border-border-default bg-bg-panel px-4 py-4">
            <GenerateInviteButton />
          </div>
        </section>

        {/* Docs footer */}
        <footer className="border-t border-border-subtle pt-6 text-xs text-fg-faint">
          <p>
            Integration and deployment procedures for your organization are provided by your Blackglass team —{" "}
            not published on this site.{" "}
            <Link href="/security" className="hover:text-fg-muted hover:underline">
              Security overview
            </Link>{" "}
            ·{" "}
            <Link href="/pricing" className="hover:text-fg-muted hover:underline">
              Pricing
            </Link>{" "}
            ·{" "}
            <Link href="/terms" className="hover:text-fg-muted hover:underline">
              Terms
            </Link>{" "}
            ·{" "}
            <Link href="/privacy" className="hover:text-fg-muted hover:underline">
              Privacy
            </Link>
          </p>
          <p className="mt-1">© Obsidian Dynamics Limited · Co. No. 16663833 · England &amp; Wales</p>
        </footer>
      </div>
    </AppShell>
  );
}
