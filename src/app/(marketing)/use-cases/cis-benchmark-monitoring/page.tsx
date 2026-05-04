import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CIS Benchmark Monitoring for Linux | BLACKGLASS",
  description:
    "Track CIS benchmark compliance posture on Linux servers over time. Blackglass captures hardening baselines and surfaces regressions from CIS-recommended SSH, sysctl, and service configurations.",
  openGraph: {
    title: "CIS Benchmark Monitoring for Linux | BLACKGLASS",
    description:
      "Track CIS benchmark compliance posture on Linux servers over time. Blackglass captures hardening baselines and surfaces regressions from CIS-recommended configurations.",
    type: "website",
    siteName: "BLACKGLASS",
  },
};

const CIS_AREAS = [
  {
    section: "SSH server configuration (CIS 5.x)",
    checks: [
      "PermitRootLogin no or prohibit-password",
      "PasswordAuthentication no",
      "MaxAuthTries ≤ 4",
      "IgnoreRhosts yes",
      "Approved cipher suites and MAC algorithms only",
      "LoginGraceTime ≤ 60 seconds",
    ],
  },
  {
    section: "Network parameters (CIS 3.x sysctl)",
    checks: [
      "net.ipv4.ip_forward = 0 (unless acting as a router)",
      "net.ipv4.conf.all.send_redirects = 0",
      "net.ipv4.tcp_syncookies = 1",
      "net.ipv6.conf.all.disable_ipv6 = 1 (if IPv6 not required)",
    ],
  },
  {
    section: "Listening services",
    checks: [
      "No unexpected TCP/UDP services open beyond the approved baseline",
      "Firewall rules present and active",
    ],
  },
];

export default function CISBenchmarkMonitoringPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-fg-muted">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
          Use case
        </p>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
          CIS benchmark monitoring for Linux with Blackglass
        </h1>

        {/* Disclaimer */}
        <div className="mt-6 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          <strong>Note:</strong> Blackglass is not a certified CIS benchmark assessment tool and does
          not provide formal compliance certification. It tracks the configuration state that CIS
          controls typically address and alerts when that state drifts — giving you continuous posture
          visibility rather than a point-in-time pass/fail report.
        </div>

        <p className="mt-6 text-lg leading-relaxed">
          The CIS Benchmarks for Linux (Ubuntu, RHEL, Debian, Amazon Linux) define several hundred
          recommendations. Most teams implement a subset, pass an initial audit, and then struggle to
          maintain posture as the fleet evolves. Blackglass helps by continuously monitoring the
          configuration areas CIS benchmarks care about most.
        </p>

        {/* Why continuous monitoring */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">
          Why point-in-time audits are not enough
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            CIS assessments are typically run quarterly or pre-audit. Drift between runs is invisible
            until someone asks.
          </li>
          <li>
            Benchmark tools like <code className="font-mono text-accent-blue">CIS-CAT</code> or{" "}
            <code className="font-mono text-accent-blue">OpenSCAP</code> report state at a moment in
            time — they do not alert when state changes after the scan.
          </li>
          <li>
            Teams that achieve a high CIS score during a hardening sprint often regress within weeks
            due to package upgrades, emergency changes, or new hosts from stale images.
          </li>
        </ul>
        <p className="mt-4 leading-relaxed text-sm">
          Blackglass complements point-in-time assessment tools by tracking the{" "}
          <em>change dimension</em> — when did this configuration value change, from what to what, and
          who was on the team when it happened?
        </p>

        {/* What Blackglass tracks */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">
          CIS-relevant areas Blackglass monitors
        </h2>
        <div className="mt-4 space-y-6">
          {CIS_AREAS.map((area) => (
            <div key={area.section} className="rounded-lg border border-border-default bg-bg-panel p-5">
              <p className="font-semibold text-fg-primary">{area.section}</p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
                {area.checks.map((c) => (
                  <li key={c}>
                    <code className="font-mono text-xs text-accent-blue">{c}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Workflow */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">
          Typical workflow for teams using CIS benchmarks
        </h2>
        <ol className="mt-4 list-decimal space-y-4 pl-5 text-sm leading-relaxed">
          <li>
            <strong className="text-fg-primary">Run your CIS assessment tool</strong> (CIS-CAT,
            OpenSCAP, or a manual audit). Remediate findings.
          </li>
          <li>
            <strong className="text-fg-primary">Capture the post-hardening state as a Blackglass
            baseline.</strong> This records the values you deliberately set.
          </li>
          <li>
            <strong className="text-fg-primary">Connect Blackglass scheduled scans.</strong> Any
            subsequent change to a monitored directive raises a drift event with severity and before/after
            values.
          </li>
          <li>
            <strong className="text-fg-primary">Respond and document.</strong> Acknowledge expected
            changes (approved patches), investigate unexpected ones, and remediate regressions.
            Blackglass records the full lifecycle.
          </li>
          <li>
            <strong className="text-fg-primary">Export evidence before the next audit.</strong>{" "}
            Demonstrate continuous monitoring with a dated evidence bundle showing every drift event
            and its resolution.
          </li>
        </ol>

        {/* What this is not */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">Scope and limitations</h2>
        <p className="mt-3 leading-relaxed text-sm">
          Blackglass does not:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Perform a full CIS benchmark assessment (hundreds of checks including filesystem
            permissions, PAM, audit daemon configuration, etc.).
          </li>
          <li>Issue a CIS compliance score or certificate.</li>
          <li>Replace a dedicated assessment tool for initial hardening.</li>
        </ul>
        <p className="mt-4 leading-relaxed text-sm">
          It is a continuous monitoring layer for the configuration dimensions that{" "}
          <em>change most often</em> and <em>matter most</em> to SSH posture and kernel hardening —
          with a drift detection and evidence workflow on top.
        </p>

        {/* Related */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">Related use cases</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
          <li>
            <Link href="/use-cases/linux-hardening-monitoring" className="text-accent-blue hover:underline">
              Linux hardening monitoring
            </Link>
          </li>
          <li>
            <Link href="/use-cases/ssh-configuration-audit" className="text-accent-blue hover:underline">
              SSH configuration audit
            </Link>
          </li>
          <li>
            <Link href="/use-cases/linux-configuration-drift-detection" className="text-accent-blue hover:underline">
              Linux configuration drift detection
            </Link>
          </li>
          <li>
            <Link href="/guides/how-to-detect-unauthorized-linux-config-changes" className="text-accent-blue hover:underline">
              Guide: Detecting unauthorized Linux config changes
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
            href="/product"
            className="rounded-lg px-5 py-2.5 text-sm font-medium text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
          >
            Full product tour →
          </Link>
        </div>
        <p className="mt-4 text-xs text-fg-faint">14-day trial · up to 10 hosts · no card required</p>
    </main>
  );
}
