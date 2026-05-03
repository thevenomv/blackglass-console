import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";

export const metadata: Metadata = {
  title: "Linux Hardening Monitoring & Baseline Audit | BLACKGLASS",
  description:
    "Track your Linux security baseline over time. Blackglass captures hardening state after each change, monitors for regression, and exports evidence for security reviews.",
  openGraph: {
    title: "Linux Hardening Monitoring & Baseline Audit | BLACKGLASS",
    description:
      "Track your Linux security baseline over time. Blackglass captures hardening state after each change, monitors for regression, and exports evidence for security reviews.",
    type: "website",
    siteName: "BLACKGLASS",
  },
};

const CHECKS = [
  { area: "SSH daemon", examples: "PermitRootLogin, PasswordAuthentication, AllowUsers, ciphers, MACs" },
  { area: "Kernel parameters", examples: "sysctl hardening: ASLR, SYN cookies, IP forwarding, core dumps" },
  { area: "Listener surface", examples: "Open TCP/UDP ports compared to approved baseline" },
  { area: "Service states", examples: "Critical services enabled/disabled vs. approved state" },
  { area: "User accounts", examples: "Privileged account set and sudo configuration" },
];

export default function LinuxHardeningMonitoringPage() {
  return (
    <div className="min-h-screen bg-bg-base text-fg-muted">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
          Use case
        </p>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
          Linux hardening monitoring with Blackglass
        </h1>
        <p className="mt-4 text-lg leading-relaxed">
          Hardening a Linux server is a point-in-time action. Monitoring hardening state is the
          ongoing discipline. Blackglass captures approved hardening baselines and alerts when any
          host regresses — giving your security team continuous evidence of posture without manual
          reviews.
        </p>

        {/* The problem */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">
          Why hardening regressions happen
        </h2>
        <p className="mt-3 leading-relaxed text-sm">
          Initial hardening is rarely the hard part. Regression is. Common sources of regression:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            OS or package upgrades that reset a configuration file to the package default (overwriting
            your hardened version).
          </li>
          <li>
            Incident response changes that weaken a control temporarily — and are never reverted
            because the host is "stable".
          </li>
          <li>
            New hosts provisioned from an outdated golden image that predates the current hardening
            standard.
          </li>
          <li>
            Configuration management drift where Ansible/Puppet/Chef diverges from what is actually
            applied due to failed runs or conditional logic.
          </li>
        </ul>

        {/* What Blackglass checks */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">
          What Blackglass monitors
        </h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-border-default">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-bg-panel">
                <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-fg-faint">
                  Area
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-fg-faint">
                  Examples
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {CHECKS.map((c) => (
                <tr key={c.area} className="bg-bg-base hover:bg-bg-panel/50">
                  <td className="px-4 py-3 font-semibold text-fg-primary">{c.area}</td>
                  <td className="px-4 py-3 font-mono text-xs leading-relaxed text-fg-muted">{c.examples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Baseline workflow */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">
          The Blackglass hardening workflow
        </h2>
        <ol className="mt-4 list-decimal space-y-5 pl-5 text-sm leading-relaxed">
          <li>
            <strong className="text-fg-primary">Harden the host.</strong> Apply your hardening
            runbook — CIS profile, internal standard, or a mix. Verify the state manually or via
            your configuration management tool.
          </li>
          <li>
            <strong className="text-fg-primary">Capture a baseline in Blackglass.</strong> Run a scan
            and mark the snapshot as the approved baseline. This records the known-good state for
            every tracked area.
          </li>
          <li>
            <strong className="text-fg-primary">Monitor continuously.</strong> Scheduled scans compare
            live state against the baseline. Any regression triggers a drift event with severity,
            affected field, old value, and new value.
          </li>
          <li>
            <strong className="text-fg-primary">Remediate with a trail.</strong> Assign the drift event
            to an owner, set a due date, and close it with a note once fixed. Blackglass records the
            full lifecycle so you can prove the regression was detected and remediated.
          </li>
          <li>
            <strong className="text-fg-primary">Export evidence.</strong> Generate an evidence bundle
            — baseline snapshot, drift history, remediation notes — for internal reviews, auditor
            requests, or compliance questionnaires.
          </li>
        </ol>

        {/* Evidence */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">
          Evidence bundles for security reviews
        </h2>
        <p className="mt-3 leading-relaxed text-sm">
          When a security reviewer, auditor, or assessor asks "show me your Linux hardening posture",
          Blackglass lets you export a structured bundle that includes:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>The approved baseline snapshot (date, host, captured by).</li>
          <li>All drift events since baseline — open, acknowledged, and closed.</li>
          <li>Operator notes and remediation records attached to each event.</li>
          <li>Export timestamp and exporting operator for chain-of-custody.</li>
        </ul>
        <p className="mt-4 leading-relaxed text-sm">
          This replaces the usual approach of screenshots, spreadsheets, and Slack history searches.
        </p>

        {/* Related */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">Related</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
          <li>
            <Link href="/use-cases/linux-configuration-drift-detection" className="text-accent-blue hover:underline">
              Linux configuration drift detection
            </Link>
          </li>
          <li>
            <Link href="/use-cases/cis-benchmark-monitoring" className="text-accent-blue hover:underline">
              CIS benchmark monitoring
            </Link>
          </li>
          <li>
            <Link href="/use-cases/ssh-configuration-audit" className="text-accent-blue hover:underline">
              SSH configuration audit
            </Link>
          </li>
          <li>
            <Link href="/product" className="text-accent-blue hover:underline">
              Full product overview
            </Link>
          </li>
        </ul>

        {/* CTAs */}
        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
          >
            Explore demo
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
          >
            Start free trial
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg px-5 py-2.5 text-sm font-medium text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
          >
            See pricing →
          </Link>
        </div>
        <p className="mt-4 text-xs text-fg-faint">14-day trial · up to 10 hosts · no card required</p>
      </main>
      <PublicFooter />
    </div>
  );
}
