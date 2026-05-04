import type { Metadata } from "next";
import Link from "next/link";
import { TrialSignupLink } from "@/components/demo/DemoGateButton";

export const metadata: Metadata = {
  title: "Product — BLACKGLASS",
  description:
    "A complete tour of Blackglass: fleet dashboard, host detail, SSH posture, baselines, drift events, evidence bundles, and role-based access for ops and security teams.",
  openGraph: {
    title: "Product — BLACKGLASS",
    description:
      "A complete tour of Blackglass: fleet dashboard, host detail, SSH posture, baselines, drift events, evidence bundles, and role-based access for ops and security teams.",
    type: "website",
    siteName: "BLACKGLASS",
  },
};

const clerkOn =
  typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0;
const signIn = clerkOn ? "/sign-in" : "/login";

const FEATURES = [
  {
    id: "fleet",
    label: "01",
    title: "Fleet dashboard",
    summary:
      "A single view of all managed hosts — scan state, drift event counts, and SSH posture score for every server in your workspace.",
    bullets: [
      "Live host list with online/offline status and last-scan timestamp.",
      "Per-host drift event count, broken down by severity (HIGH / MEDIUM / INFO).",
      "SSH posture summary: passing, warning, and failing directive checks.",
      "Risk-score ordering so the highest-risk hosts surface first.",
      "Click through to any host for the full detail view.",
    ],
    useCase: null,
  },
  {
    id: "host-detail",
    label: "02",
    title: "Host detail view",
    summary:
      "Everything Blackglass knows about a single host: baseline metadata, open drift events, SSH configuration, listeners, and service states — in one place.",
    bullets: [
      "Active baseline with capture timestamp and capturing operator.",
      "Open drift events with before/after values and severity classification.",
      "Effective SSH configuration (resolved across all Include fragments via sshd -T).",
      "Open TCP/UDP listener list compared to the approved baseline.",
      "Service states for tracked critical services.",
    ],
    useCase: "/use-cases/ssh-configuration-audit",
    useCaseLabel: "SSH audit use case →",
  },
  {
    id: "baselines",
    label: "03",
    title: "Baselines",
    summary:
      "Capture an approved snapshot of host state after a hardening pass, deployment, or change freeze. All future scans compare against that baseline.",
    bullets: [
      "One-click baseline capture from the host view or via API.",
      "Baseline metadata: captured by, captured at, host scan ID.",
      "Baseline history — previous baselines are retained for audit queries.",
      "Baseline approval workflow on Business and Enterprise plans.",
      "Compare any two baselines side-by-side to understand what changed between them.",
    ],
    useCase: "/use-cases/linux-hardening-monitoring",
    useCaseLabel: "Hardening monitoring use case →",
  },
  {
    id: "drift",
    label: "04",
    title: "Drift events",
    summary:
      "When a scan finds a configuration value that differs from the approved baseline, Blackglass creates a drift event with severity, field, before/after values, and a remediation workflow.",
    bullets: [
      "Severity: HIGH (security-critical directives), MEDIUM (hardening-relevant), INFO (cosmetic/expected).",
      "Field-level diff: shows exactly which directive changed and the old vs. new value.",
      "Assign owner, set due date, add notes, and close with a resolution record.",
      "Filter by severity, host, status (open / acknowledged / closed), and date range.",
      "Webhook notifications for new HIGH and MEDIUM events to Slack, email, or any HTTP endpoint.",
    ],
    useCase: "/use-cases/linux-configuration-drift-detection",
    useCaseLabel: "Drift detection deep-dive →",
  },
  {
    id: "evidence",
    label: "05",
    title: "Evidence bundles & reports",
    summary:
      "Export a structured, dated evidence bundle for a host or the whole fleet — useful for auditors, internal security reviews, and compliance questionnaires.",
    bullets: [
      "Bundle includes: baseline snapshot, all drift events in scope, remediation records, and exporter metadata.",
      "Operator notes and acknowledgements are included inline for chain-of-custody.",
      "Export format is structured for readability by non-technical reviewers.",
      "Scoped exports: per-host, per-environment, or full-workspace.",
      "Audit log covers every export event (who exported, when, what scope).",
    ],
    useCase: "/use-cases/linux-hardening-monitoring",
    useCaseLabel: "Hardening monitoring use case →",
  },
  {
    id: "rbac",
    label: "06",
    title: "Roles & access",
    summary:
      "Five roles with distinct permissions — from read-only external auditors to workspace owners. Viewers and guest auditors are always unlimited on paid plans.",
    bullets: [
      "Owner: full workspace control, billing, member management.",
      "Admin: manage members, baselines, and settings.",
      "Operator: run scans, capture baselines, manage drift events.",
      "Viewer: read-only access to all workspace data — unlimited on paid plans.",
      "Guest auditor: scoped read access for external reviewers — unlimited on paid plans.",
      "All role checks enforced server-side; cannot be bypassed from the browser.",
    ],
    useCase: null,
  },
];

export default function ProductPage() {
  return (
    <main>
        {/* Hero */}
        <section className="border-b border-border-subtle px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
              Product
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
              Linux integrity monitoring without scraping secrets off the host
            </h1>
            <p className="mt-4 text-lg leading-relaxed">
              Blackglass standardizes how you capture approved SSH and listener baselines, run drift
              scans on demand or on schedule, and export auditor-ready evidence — with workspace
              isolation per organisation and role-based access baked in from the start.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/demo"
                className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
              >
                Explore demo
              </Link>
              <TrialSignupLink className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated">
                Start free trial
              </TrialSignupLink>
              <Link
                href={signIn}
                className="rounded-lg px-5 py-2.5 text-sm font-medium text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        {/* Feature tour */}
        <section className="px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl space-y-16">
            {FEATURES.map((f) => (
              <article key={f.id} id={f.id} className="scroll-mt-20">
                <div className="flex items-start gap-4">
                  <span className="font-mono text-xs font-semibold text-accent-blue">{f.label}</span>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-fg-primary">{f.title}</h2>
                    <p className="mt-3 leading-relaxed">{f.summary}</p>
                    <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
                      {f.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    {f.useCase && (
                      <p className="mt-4 text-sm">
                        <Link href={f.useCase} className="text-accent-blue hover:underline">
                          {f.useCaseLabel}
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
                <div className="ml-8 mt-6 border-b border-border-subtle" aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>

        {/* Collector model */}
        <section className="border-t border-border-subtle bg-bg-panel/40 px-4 py-14">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-xl font-semibold text-fg-primary">Collector model</h2>
            <p className="mt-3 leading-relaxed text-sm">
              Blackglass uses an agentless SSH collection model for most deployments. For hosts not
              reachable over SSH from the control plane (NAT-ed internal hosts, air-gapped segments),
              a push-ingest agent can be deployed on the host itself.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
              <li>
                <strong className="text-fg-primary">Agentless (pull):</strong> Blackglass connects
                over SSH using a dedicated least-privilege collector user. No root access required.
              </li>
              <li>
                <strong className="text-fg-primary">Agent (push):</strong> For hosts that cannot be
                reached from the outside, a lightweight agent sends scan results to the Blackglass
                ingest API over HTTPS.
              </li>
              <li>
                <strong className="text-fg-primary">No secrets harvested:</strong> The collector
                gathers configuration metadata — SSH directives, sysctl values, open listeners,
                service states. It does not read application configuration, environment variables,
                or private keys.
              </li>
            </ul>
          </div>
        </section>

        {/* Internal links */}
        <section className="px-4 py-12">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-lg font-semibold text-fg-primary">Explore by use case</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { href: "/use-cases/linux-configuration-drift-detection", label: "Linux configuration drift detection" },
                { href: "/use-cases/ssh-configuration-audit", label: "SSH configuration audit" },
                { href: "/use-cases/linux-hardening-monitoring", label: "Linux hardening monitoring" },
                { href: "/use-cases/cis-benchmark-monitoring", label: "CIS benchmark monitoring" },
                { href: "/guides/how-to-detect-unauthorized-linux-config-changes", label: "Guide: Detect unauthorized changes" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block rounded-lg border border-border-default bg-bg-panel px-4 py-3 text-sm hover:border-accent-blue/50 hover:text-fg-primary"
                  >
                    {l.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border-subtle bg-bg-panel/50 px-4 py-14">
          <div className="mx-auto flex max-w-3xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-fg-primary">Ready to connect your first host?</h2>
              <p className="mt-2 text-sm">
                Start with the demo, then provision a workspace when you are ready to connect real
                infrastructure.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/demo"
                className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
              >
                Explore demo
              </Link>
              <TrialSignupLink className="rounded-lg border border-border-default bg-bg-base px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated">
                Start free trial
              </TrialSignupLink>
            </div>
          </div>
        </section>
    </main>
  );
}

