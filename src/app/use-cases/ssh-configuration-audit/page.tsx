import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";

export const metadata: Metadata = {
  title: "SSH Configuration Audit Tool | BLACKGLASS",
  description:
    "Audit sshd_config changes across your Linux fleet. Blackglass surfaces SSH misconfigurations, tracks posture against a baseline, and flags high-risk directives like PermitRootLogin and weak ciphers.",
  openGraph: {
    title: "SSH Configuration Audit Tool | BLACKGLASS",
    description:
      "Audit sshd_config changes across your Linux fleet. Blackglass surfaces SSH misconfigurations, tracks posture against a baseline, and flags high-risk directives.",
    type: "website",
    siteName: "BLACKGLASS",
  },
};

const COMMON_MISCONFIGS = [
  {
    directive: "PermitRootLogin yes",
    risk: "HIGH",
    why: "Allows direct root login over SSH, eliminating the audit trail of sudo and making brute-force attacks directly privileged.",
  },
  {
    directive: "PasswordAuthentication yes",
    risk: "HIGH",
    why: "Enables password-based authentication. Combined with weak passwords or password reuse, this is a common initial access vector.",
  },
  {
    directive: "PermitEmptyPasswords yes",
    risk: "HIGH",
    why: "Allows accounts with no password to authenticate. Should never appear on a production host.",
  },
  {
    directive: "X11Forwarding yes",
    risk: "MEDIUM",
    why: "Increases attack surface for X11-related exploits. Rarely needed on server-class Linux hosts.",
  },
  {
    directive: "Weak MACs / Ciphers",
    risk: "MEDIUM",
    why: "Older algorithms (arcfour, hmac-md5, diffie-hellman-group1) can be exploited by a network attacker.",
  },
  {
    directive: "MaxAuthTries not set (default 6)",
    risk: "LOW",
    why: "Allows more guesses per connection than most hardening guides recommend (≤3).",
  },
];

export default function SSHAuditPage() {
  return (
    <div className="min-h-screen bg-bg-base text-fg-muted">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
          Use case
        </p>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
          SSH configuration audit with Blackglass
        </h1>
        <p className="mt-4 text-lg leading-relaxed">
          SSH is the primary management plane for most Linux infrastructure. A single misconfigured
          directive — <code className="font-mono text-accent-blue">PermitRootLogin</code>,{" "}
          <code className="font-mono text-accent-blue">PasswordAuthentication</code>, weak ciphers —
          can turn a hardened host into a liability. Blackglass keeps a continuous audit of every
          SSH directive across your fleet.
        </p>

        {/* The problem */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">
          Why SSH audits are hard to sustain manually
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <code className="font-mono text-accent-blue">sshd_config</code> can include fragment
            files from <code className="font-mono text-accent-blue">/etc/ssh/sshd_config.d/</code>.
            Point-in-time reviews miss Include changes entirely.
          </li>
          <li>
            Package upgrades sometimes ship a new default <code className="font-mono text-accent-blue">sshd_config</code>{" "}
            that silently resets a directive you previously hardened.
          </li>
          <li>
            Fleet size makes manual per-host review impractical. A 50-host spreadsheet goes stale
            within days.
          </li>
          <li>
            Auditors and frameworks (CIS, SOC 2, ISO 27001) routinely ask for SSH posture evidence.
            Screenshots and ad-hoc exports are not reproducible.
          </li>
        </ul>

        {/* Common misconfigs */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">
          Common SSH misconfigurations Blackglass surfaces
        </h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-border-default">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-bg-panel">
                <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-fg-faint">
                  Directive
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-fg-faint">
                  Risk
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-fg-faint">
                  Why it matters
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {COMMON_MISCONFIGS.map((row) => (
                <tr key={row.directive} className="bg-bg-base hover:bg-bg-panel/50">
                  <td className="px-4 py-3 font-mono text-xs text-accent-blue">{row.directive}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                        row.risk === "HIGH"
                          ? "bg-red-500/10 text-red-400"
                          : row.risk === "MEDIUM"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-border-subtle text-fg-faint"
                      }`}
                    >
                      {row.risk}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs leading-relaxed text-fg-muted">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* How Blackglass helps */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">
          How Blackglass handles SSH auditing
        </h2>
        <ol className="mt-4 list-decimal space-y-4 pl-5 text-sm leading-relaxed">
          <li>
            <strong className="text-fg-primary">Full directive capture.</strong> On each scan,
            Blackglass collects the effective SSH configuration — including resolved{" "}
            <code className="font-mono text-accent-blue">Include</code> fragments — so the
            baseline reflects what sshd actually applies, not just the main file.
          </li>
          <li>
            <strong className="text-fg-primary">Baseline comparison.</strong> Each directive is
            compared to your approved baseline. New, removed, and changed directives are shown
            separately with their severity classification.
          </li>
          <li>
            <strong className="text-fg-primary">Fleet-wide posture view.</strong> The SSH posture
            panel on the host detail view shows passing, warning, and failing checks at a glance.
            The fleet dashboard rolls this up across all managed hosts.
          </li>
          <li>
            <strong className="text-fg-primary">Evidence export.</strong> Export a dated evidence
            bundle for a host or the whole fleet — including baseline diffs, operator notes, and
            remediation records — for audit or review submissions.
          </li>
        </ol>

        {/* Related */}
        <h2 className="mt-12 text-xl font-semibold text-fg-primary">Related use cases</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
          <li>
            <Link href="/use-cases/linux-configuration-drift-detection" className="text-accent-blue hover:underline">
              Linux configuration drift detection
            </Link>{" "}
            — broader drift tracking beyond SSH.
          </li>
          <li>
            <Link href="/use-cases/cis-benchmark-monitoring" className="text-accent-blue hover:underline">
              CIS benchmark monitoring
            </Link>{" "}
            — map SSH checks to CIS recommendations.
          </li>
          <li>
            <Link href="/use-cases/linux-hardening-monitoring" className="text-accent-blue hover:underline">
              Linux hardening monitoring
            </Link>{" "}
            — baseline capture and hardening evidence.
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
      <PublicFooter />
    </div>
  );
}
