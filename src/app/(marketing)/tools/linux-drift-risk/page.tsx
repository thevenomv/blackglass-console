import type { Metadata } from "next";
import Link from "next/link";
import { LinuxDriftRiskClient } from "@/components/tools/LinuxDriftRiskClient";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical } from "@/lib/seo";

const PATH = "/tools/linux-drift-risk";
const TITLE = "Linux Drift Risk Score — Blackglass Tools";
const DESCRIPTION =
  "Five-question questionnaire that scores your Linux change-control posture and surfaces the three drift classes most worth watching.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical(PATH) },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Blackglass",
    url: canonical(PATH),
    images: [{ url: "/og-tools.png", width: 1200, height: 630, alt: "Blackglass Tools" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-tools.png"],
  },
};

export default function LinuxDriftRiskPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:py-14">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Tools", url: "/tools" },
          { name: "Linux Drift Risk Score", url: PATH },
        ])}
      />
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-fg-primary">Linux Drift Risk Score</h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{DESCRIPTION}</p>
        <p className="mt-3 rounded-card border border-accent-blue/25 bg-accent-blue/5 px-4 py-3 text-xs leading-relaxed text-fg-muted">
          A pre-scan planning tool aligned with{" "}
          <Link href="/product" className="text-accent-blue hover:underline">
            Blackglass
          </Link>{" "}
          — multiple-choice only, no free-text, no fleet data ever leaves your browser. For
          continuous drift detection with severity, urgency, and exports your auditor can read,
          use Blackglass itself.
        </p>
        <p className="mt-3 rounded-card border border-border-subtle bg-bg-panel/60 px-4 py-3 text-xs leading-relaxed text-fg-muted">
          <span className="font-semibold text-fg-primary">Privacy:</span> the questionnaire never
          requests, stores, or processes hostnames, distros by name, or any operator commentary.
          Inputs are five multiple-choice questions and the result lives in your browser.
        </p>
      </header>

      <LinuxDriftRiskClient />

      <section
        aria-labelledby="trust-note"
        className="mt-10 rounded-card border border-border-default bg-bg-panel px-5 py-4 text-xs leading-relaxed text-fg-muted"
      >
        <h3 id="trust-note" className="text-sm font-semibold text-fg-primary">
          What this score does — and doesn&rsquo;t
        </h3>
        <ul className="mt-2 space-y-1.5">
          <li>
            <span className="text-fg-primary">Directional, not authoritative.</span> Weights are
            calibrated for educational estimation, not production-grade classification. They are
            not the heuristics Blackglass uses on real fleets.
          </li>
          <li>
            <span className="text-fg-primary">No telemetry collected.</span> Your selections are
            scored locally; nothing is uploaded.
          </li>
          <li>
            <span className="text-fg-primary">Output is shaped for action.</span> A score, three
            drift classes worth watching first, and a short list of next steps — not a
            50-page report nobody reads.
          </li>
        </ul>
        <p className="mt-3 text-fg-faint">
          Powered by Blackglass · See the{" "}
          <Link href="/security" className="text-accent-blue hover:underline">
            security overview
          </Link>{" "}
          for how the paid product handles your data, or{" "}
          <Link
            href="/demo?source=tools-linux-drift-risk-footer"
            className="text-accent-blue hover:underline"
          >
            explore a sample workspace
          </Link>{" "}
          first.
        </p>
      </section>
    </main>
  );
}
