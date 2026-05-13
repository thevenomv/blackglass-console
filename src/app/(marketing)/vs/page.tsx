import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { marketingMailtoHref } from "@/lib/marketing/contact";
import { breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";

const TITLE = "Blackglass vs security platforms";
const DESCRIPTION =
  "Honest, public-info comparisons of Blackglass against Wiz, Lacework, Orca, Tenable, Qualys, Wazuh, and SentinelOne. Most teams keep their existing security tool and add Blackglass for the baseline-first Linux configuration drift evidence it can't produce.";

export const metadata: Metadata = {
  title: `${TITLE} · Blackglass`,
  description: DESCRIPTION,
  alternates: { canonical: canonical("/vs") },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Blackglass",
    url: canonical("/vs"),
    images: dynamicOgImages({
      title: "Blackglass vs security platforms",
      subtitle: "Honest comparisons · Wiz, Lacework, Orca, Tenable, Qualys, Wazuh, SentinelOne",
    }),
  },
};

const COMPARISONS = [
  {
    href: "/vs/wiz",
    competitor: "Wiz",
    blurb:
      "Cloud-native CNAPP focused on cloud posture and identity. Often deployed alongside Blackglass for in-server drift the agentless scanner can't see.",
  },
  {
    href: "/vs/lacework",
    competitor: "Lacework",
    blurb:
      "Polygraph-based runtime workload protection. Strong on cloud anomaly detection; lighter on the deterministic Linux config-drift signal Blackglass specialises in.",
  },
  {
    href: "/vs/orca",
    competitor: "Orca Security",
    blurb:
      "SideScanning gives broad cloud visibility without agents. Pairs naturally with Blackglass for the inside-the-server view that agentless can't reach by definition.",
  },
  {
    href: "/vs/tenable",
    competitor: "Tenable",
    blurb:
      "Category-defining vulnerability management (Nessus, Tenable.io). Often paired with Blackglass when the gap is 'what changed inside sshd since we patched?' not 'what CVEs exist?'.",
  },
  {
    href: "/vs/qualys",
    competitor: "Qualys",
    blurb:
      "Enterprise VMDR and Policy Compliance at scale. Blackglass adds baseline-first Linux drift for teams that already standardise on Qualys but still need per-line change evidence.",
  },
  {
    href: "/vs/wazuh",
    competitor: "Wazuh",
    blurb:
      "Open-source SIEM/XDR with broad HIDS, FIM, and compliance coverage. Blackglass adds an explicit approved-baseline layer and per-line auditor evidence when Wazuh's change-event logs aren't enough for compliance.",
  },
  {
    href: "/vs/sentinelone",
    competitor: "SentinelOne",
    blurb:
      "AI-powered EDR/XDR for runtime threat detection and autonomous response. Blackglass covers the orthogonal question: what changed inside Linux configuration since the baseline you approved?",
  },
];

export default function VsIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Compare", url: "/vs" },
        ])}
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Compare</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
        Blackglass vs security platforms
      </h1>
      <p className="mt-4 text-lg leading-relaxed">
        We get asked this a lot: &ldquo;we already have Wiz / SentinelOne / Wazuh — do we need
        Blackglass too?&rdquo; Short answer: usually yes, because they&rsquo;re looking at
        different things. The pages below set out the boundary in detail, with capability
        comparisons sourced from each vendor&rsquo;s own public marketing.
      </p>

      <section className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {COMPARISONS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-card border border-border-default bg-bg-panel p-5 hover:border-accent-blue/50"
          >
            <h2 className="text-base font-semibold text-fg-primary group-hover:text-accent-blue">
              Blackglass vs {c.competitor}
            </h2>
            <p className="mt-2 text-sm leading-relaxed">{c.blurb}</p>
            <p className="mt-3 text-xs text-fg-faint">
              Read the comparison →
            </p>
          </Link>
        ))}
      </section>

      <section className="mt-12 rounded-card border border-border-default bg-bg-panel p-6">
        <h2 className="text-base font-semibold text-fg-primary">
          The short version, in one sentence
        </h2>
        <p className="mt-3 text-sm leading-relaxed">
          EDR and XDR platforms (SentinelOne, Wazuh) watch what&rsquo;s{" "}
          <em>running</em> — processes, file execution, network connections. Cloud-native
          platforms (Wiz, Lacework, Orca) watch the{" "}
          <em>shape of your cloud</em> — IAM, posture, exposed images. Vulnerability scanners
          (Tenable, Qualys) watch what&rsquo;s{" "}
          <em>unpatched</em>. Blackglass watches what&rsquo;s{" "}
          <em>changed inside each Linux server since baseline</em> — sshd config, sudoers,
          package versions, hardening profile — captured against a state you approved, with
          per-line evidence ready for auditors. All four views are necessary; none is
          sufficient on its own.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/product"
            className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
          >
            See the product
          </Link>
          <Link
            href="/demo"
            className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
          >
            Open the demo workspace
          </Link>
        </div>
      </section>

      <p className="mt-8 text-xs text-fg-faint">
        Want a comparison page that isn&rsquo;t listed?{" "}
        <a
          className="text-accent-blue hover:underline"
          href={marketingMailtoHref("Comparison request")}
        >
          Tell us which vendor
        </a>{" "}
        and we&rsquo;ll write it.
      </p>
    </main>
  );
}
