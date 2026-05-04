import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Linux Configuration Drift Detection | BLACKGLASS",
  description:
    "Detect unauthorized changes to Linux server configuration in real time. Blackglass captures approved baselines and surfaces drift across sshd, sysctl, listeners, and more.",
  openGraph: {
    title: "Linux Configuration Drift Detection | BLACKGLASS",
    description:
      "Detect unauthorized changes to Linux server configuration in real time. Blackglass captures approved baselines and surfaces drift across sshd, sysctl, listeners, and more.",
    type: "website",
    siteName: "BLACKGLASS",
  },
};

export default function LinuxDriftDetectionPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-fg-muted">
        {/* Breadcrumb */}
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
          Use case
        </p>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
          Linux configuration drift detection with Blackglass
        </h1>
        <p className="mt-4 text-lg leading-relaxed">
          Every fleet drifts. Manual interventions, package updates, automation gaps, and emergency
          fixes all leave server state diverging from the known-good baseline. Blackglass makes drift
          visible, measurable, and actionable.
        </p>

        {/* Problem */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">Why configuration drift happens</h2>
        <p className="mt-3 leading-relaxed">
          In practice, Linux servers accumulate unplanned changes for several reasons:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong className="text-fg-primary">Manual hotfixes</strong> — an operator tweaks{" "}
            <code className="font-mono text-accent-blue">/etc/ssh/sshd_config</code> during an
            incident and never reverts the change.
          </li>
          <li>
            <strong className="text-fg-primary">Package upgrades</strong> — a kernel or service
            update overwrites a sysctl or PAM config without a corresponding policy update.
          </li>
          <li>
            <strong className="text-fg-primary">Automation scripts</strong> — a one-off Ansible play
            or shell script touches the host and the change is never codified in your IaC repo.
          </li>
          <li>
            <strong className="text-fg-primary">Configuration management gaps</strong> — hosts
            provisioned before your current tooling era drift silently for months.
          </li>
        </ul>
        <p className="mt-4 leading-relaxed">
          The problem is not that drift happens — it is that you only find out about it when something
          breaks, when a pen-tester reports it, or when an auditor asks for evidence.
        </p>

        {/* Solution */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">How Blackglass detects drift</h2>
        <ol className="mt-4 list-decimal space-y-4 pl-5 text-sm leading-relaxed">
          <li>
            <strong className="text-fg-primary">Baseline snapshot.</strong> After a hardening pass or
            change freeze, you capture an approved baseline in Blackglass — recording the current
            state of SSH configuration, kernel parameters, open listeners, and service states.
          </li>
          <li>
            <strong className="text-fg-primary">Scheduled or on-demand scans.</strong> Blackglass
            re-collects the same metadata on the schedule you define (hourly, daily, or triggered
            post-deployment). It compares the live state to the approved baseline.
          </li>
          <li>
            <strong className="text-fg-primary">Severity-classified drift events.</strong> Changes are
            surfaced with a severity level (HIGH / MEDIUM / INFO) based on the field affected. A{" "}
            <code className="font-mono text-accent-blue">PermitRootLogin yes</code> change is HIGH; a
            comment-line change is INFO. You control the noise floor.
          </li>
          <li>
            <strong className="text-fg-primary">Remediation workflow.</strong> Each drift event can be
            acknowledged, assigned an owner, given a due date, and closed with a note. The full
            history is exportable as an evidence bundle for audits.
          </li>
        </ol>

        {/* What it covers */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">What Blackglass tracks</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong className="text-fg-primary">SSH daemon configuration</strong> — every directive
            in <code className="font-mono text-accent-blue">sshd_config</code> and active{" "}
            <code className="font-mono text-accent-blue">Include</code> fragments.
          </li>
          <li>
            <strong className="text-fg-primary">Kernel parameters</strong> — sysctl values relevant
            to network hardening, randomisation, and exploit mitigation.
          </li>
          <li>
            <strong className="text-fg-primary">Open listener surface</strong> — TCP/UDP ports bound
            at time of scan, compared to baseline to surface new or removed services.
          </li>
          <li>
            <strong className="text-fg-primary">Service states</strong> — critical service
            enable/disable status that should remain stable across deployments.
          </li>
        </ul>
        <p className="mt-4 leading-relaxed">
          Blackglass does <em>not</em> copy file contents, application secrets, or private keys into
          its storage — only the metadata needed to detect meaningful drift.
        </p>

        {/* Product preview */}
        <div className="mt-12 rounded-lg border border-border-default bg-bg-panel p-5">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-faint">
            Sample drift event
          </p>
          <div className="mt-4 space-y-2 font-mono text-sm">
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-400">HIGH</span>
              <div>
                <p className="text-fg-primary">sshd / PermitRootLogin</p>
                <p className="mt-0.5 text-xs text-fg-faint">
                  baseline: <span className="text-emerald-400">prohibit-password</span>
                  {" → "}current: <span className="text-red-400">yes</span>
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-400">MED</span>
              <div>
                <p className="text-fg-primary">sysctl / net.ipv4.tcp_syncookies</p>
                <p className="mt-0.5 text-xs text-fg-faint">
                  baseline: <span className="text-emerald-400">1</span>
                  {" → "}current: <span className="text-amber-400">0</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Internal links */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">Related use cases</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
          <li>
            <Link href="/use-cases/ssh-configuration-audit" className="text-accent-blue hover:underline">
              SSH configuration audit
            </Link>{" "}
            — detailed posture review for sshd_config directives.
          </li>
          <li>
            <Link href="/use-cases/linux-hardening-monitoring" className="text-accent-blue hover:underline">
              Linux hardening monitoring
            </Link>{" "}
            — track your hardening baseline over time.
          </li>
          <li>
            <Link href="/guides/how-to-detect-unauthorized-linux-config-changes" className="text-accent-blue hover:underline">
              Guide: How to detect unauthorized Linux config changes
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
