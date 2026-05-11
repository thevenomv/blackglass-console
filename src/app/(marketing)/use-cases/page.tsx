import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, defaultOgImages } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Use Cases · Blackglass",
  description:
    "Practical ways teams use Blackglass: catching silent server drift, reviewing remote access, keeping hardening honest, and staying aligned with common security baselines.",
  alternates: { canonical: canonical("/use-cases") },
  openGraph: {
    title: "Use Cases · Blackglass",
    description:
      "Stories and starting points for operations and security leaders who want calmer Linux visibility.",
    type: "website",
    siteName: "Blackglass",
    url: canonical("/use-cases"),
    images: defaultOgImages(),
  },
};

const USE_CASES = [
  {
    href: "/use-cases/linux-configuration-drift-detection",
    title: "Linux configuration drift detection",
    description:
      "Save what “good” looks like, then get a steady stream of clear alerts when real servers wander away from it.",
    keywords: ["linux drift", "server drift monitoring", "config change detection"],
  },
  {
    href: "/use-cases/ssh-configuration-audit",
    title: "SSH configuration audit",
    description:
      "Keep remote login settings consistent and catch risky changes before they spread across your fleet.",
    keywords: ["ssh audit", "sshd_config audit", "ssh posture"],
  },
  {
    href: "/use-cases/linux-hardening-monitoring",
    title: "Linux hardening monitoring",
    description:
      "See when updates or quick fixes accidentally undo careful lockdown — and prove what good looked like at any point in time.",
    keywords: ["linux hardening", "security baseline", "hardening regression"],
  },
  {
    href: "/use-cases/cis-benchmark-monitoring",
    title: "CIS benchmark monitoring",
    description:
      "Stay close to the parts of CIS-style guidance that matter to you, with alerts when posture slips between formal audits.",
    keywords: ["CIS benchmark", "CIS linux", "compliance monitoring"],
  },
  {
    href: "/use-cases/file-integrity-monitoring",
    title: "File integrity monitoring (FIM)",
    description:
      "Practical FIM for Linux — hash-based change detection on the files compliance frameworks actually care about, without the alert noise.",
    keywords: ["file integrity monitoring", "FIM", "PCI DSS 11.5"],
  },
  {
    href: "/use-cases/sox-evidence-capture",
    title: "SOX & SOC 2 change-control evidence",
    description:
      "Auditor-grade evidence of every server config change, tied to operator approval. Replaces manual screenshot collection with one-click PDF + JSON exports.",
    keywords: ["SOX", "SOC 2", "ITGC", "change control evidence"],
  },
  {
    href: "/use-cases/incident-response-baselines",
    title: "Incident response baselines",
    description:
      "First question in any Linux incident: what changed? Get a per-line diff against the last approved baseline in seconds — before you image, before you escalate.",
    keywords: ["incident response", "Linux IR", "baseline triage"],
  },
];

export default function UseCasesIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
        <JsonLd
          id="schema-breadcrumb"
          data={breadcrumbSchema([
            { name: "Home", url: "/" },
            { name: "Use cases", url: "/use-cases" },
          ])}
        />
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Use cases</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
          Where Blackglass fits
        </h1>
        <p className="mt-4 text-lg leading-relaxed">
          You might be leading infrastructure, answering to a board, or partnering with IT. These
          are the problems teams tell us Blackglass makes feel lighter — without asking everyone to
          become a Linux specialist overnight.
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
              <p className="mt-3 text-xs text-fg-faint">Popular with platform &amp; security leads</p>
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
              <Link href="/glossary" className="text-accent-blue hover:underline">
                Glossary — drift, baselines, RLS, Charon
              </Link>
            </li>
            <li>
              <Link href="/vs" className="text-accent-blue hover:underline">
                Compare — Blackglass vs CNAPP &amp; VM vendors
              </Link>
            </li>
            <li>
              <Link href="/blog" className="text-accent-blue hover:underline">
                Engineering &amp; product blog
              </Link>
            </li>
            <li>
              <Link href="/product" className="text-accent-blue hover:underline">
                Full product overview
              </Link>
            </li>
            <li>
              <Link href="/demo" className="text-accent-blue hover:underline">
                Demo workspace (illustrative data)
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
  );
}
