import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";

export const metadata: Metadata = {
  title: "Use Cases | BLACKGLASS",
  description:
    "How ops and security teams use Blackglass: Linux configuration drift detection, SSH posture auditing, hardening monitoring, and CIS benchmark tracking.",
  openGraph: {
    title: "Use Cases | BLACKGLASS",
    description:
      "How ops and security teams use Blackglass: Linux configuration drift detection, SSH posture auditing, hardening monitoring, and CIS benchmark tracking.",
    type: "website",
    siteName: "BLACKGLASS",
  },
};

const USE_CASES = [
  {
    href: "/use-cases/linux-configuration-drift-detection",
    title: "Linux configuration drift detection",
    description:
      "Capture approved baselines and surface drift across sshd, sysctl, listeners, and service states — with severity classification and a remediation workflow.",
    keywords: ["linux drift", "server drift monitoring", "config change detection"],
  },
  {
    href: "/use-cases/ssh-configuration-audit",
    title: "SSH configuration audit",
    description:
      "Track every SSH directive change across your fleet. Surface PermitRootLogin, weak ciphers, and other misconfigurations against an approved baseline.",
    keywords: ["ssh audit", "sshd_config audit", "ssh posture"],
  },
  {
    href: "/use-cases/linux-hardening-monitoring",
    title: "Linux hardening monitoring",
    description:
      "Monitor hardening posture after every change. Detect regressions from package upgrades, emergency fixes, or stale golden images, and export evidence for reviews.",
    keywords: ["linux hardening", "security baseline", "hardening regression"],
  },
  {
    href: "/use-cases/cis-benchmark-monitoring",
    title: "CIS benchmark monitoring",
    description:
      "Track the configuration areas CIS benchmarks address — SSH, sysctl, listeners — and detect when state drifts from your CIS-aligned baseline.",
    keywords: ["CIS benchmark", "CIS linux", "compliance monitoring"],
  },
];

export default function UseCasesIndexPage() {
  return (
    <div className="min-h-screen bg-bg-base text-fg-muted">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
          Use cases
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
          How teams use Blackglass
        </h1>
        <p className="mt-4 text-lg leading-relaxed">
          Blackglass is used by SREs, security engineers, and platform teams who need continuous
          visibility into Linux configuration state — not just point-in-time audit reports.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {USE_CASES.map((uc) => (
            <Link
              key={uc.href}
              href={uc.href}
              className="group rounded-lg border border-border-default bg-bg-panel p-5 hover:border-accent-blue/50"
            >
              <h2 className="font-semibold text-fg-primary group-hover:text-accent-blue">
                {uc.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed">{uc.description}</p>
              <p className="mt-3 text-xs text-fg-faint">{uc.keywords.join(" · ")}</p>
            </Link>
          ))}
        </div>

        <div className="mt-12 rounded-lg border border-border-default bg-bg-panel p-5">
          <p className="font-semibold text-fg-primary">Also relevant</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/guides/how-to-detect-unauthorized-linux-config-changes" className="text-accent-blue hover:underline">
                Guide: How to detect unauthorized Linux config changes
              </Link>
            </li>
            <li>
              <Link href="/product" className="text-accent-blue hover:underline">
                Full product overview
              </Link>
            </li>
            <li>
              <Link href="/demo" className="text-accent-blue hover:underline">
                Interactive demo
              </Link>
            </li>
          </ul>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
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
        </div>
        <p className="mt-4 text-xs text-fg-faint">14-day trial · up to 10 hosts · no card required</p>
      </main>
      <PublicFooter />
    </div>
  );
}
