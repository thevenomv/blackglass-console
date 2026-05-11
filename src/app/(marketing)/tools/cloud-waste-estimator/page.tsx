import type { Metadata } from "next";
import Link from "next/link";
import { CloudWasteEstimatorClient } from "@/components/tools/CloudWasteEstimatorClient";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical } from "@/lib/seo";

const PATH = "/tools/cloud-waste-estimator";
const TITLE = "Cloud Waste Estimator — Blackglass";
const DESCRIPTION =
  "Estimate how much you might be wasting on idle droplets, ghost volumes, and old snapshots — without API keys.";

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

export default function CloudWasteEstimatorPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:py-14">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Tools", url: "/tools" },
          { name: "Cloud Waste Estimator", url: PATH },
        ])}
      />
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-fg-primary">Cloud Waste Estimator</h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          {DESCRIPTION}
        </p>
        <p className="mt-3 rounded-card border border-accent-blue/25 bg-accent-blue/5 px-4 py-3 text-xs leading-relaxed text-fg-muted">
          A pre-scan planning tool aligned with{" "}
          <Link href="/product#charon" className="text-accent-blue hover:underline">
            Charon in Blackglass
          </Link>
          {" "}— same categories, rough self-reported inputs, no credentials. For continuous
          multi-cloud scans with approval-gated cleanup, use Charon itself.
        </p>
        <p className="mt-3 rounded-card border border-border-subtle bg-bg-panel/60 px-4 py-3 text-xs leading-relaxed text-fg-muted">
          <span className="font-semibold text-fg-primary">Privacy:</span> the free estimator never
          requests, stores, or processes cloud credentials, hostnames, or live resource
          identifiers. Counts and costs never leave your browser unless you choose to email
          yourself the summary.
        </p>
      </header>

      <CloudWasteEstimatorClient />

      <section
        aria-labelledby="trust-note"
        className="mt-10 rounded-card border border-border-default bg-bg-panel px-5 py-4 text-xs leading-relaxed text-fg-muted"
      >
        <h3 id="trust-note" className="text-sm font-semibold text-fg-primary">
          What this tool does — and doesn&rsquo;t
        </h3>
        <ul className="mt-2 space-y-1.5">
          <li>
            <span className="text-fg-primary">All maths runs in your browser.</span> Counts and
            costs never leave your device unless you choose to email yourself the summary.
          </li>
          <li>
            <span className="text-fg-primary">No credentials, hostnames, or resource IDs.</span>{" "}
            The form only accepts generic counts and per-unit prices.
          </li>
          <li>
            <span className="text-fg-primary">Directionally useful, not authoritative.</span> The
            coefficients are intentionally approximate and calibrated for educational estimation,
            not production-grade classification — real bills depend on instance type, region,
            reservations, and savings plans an estimator can&rsquo;t see.
          </li>
        </ul>
        <p className="mt-3 text-fg-faint">
          Powered by Blackglass · See the{" "}
          <Link href="/security" className="text-accent-blue hover:underline">
            security overview
          </Link>{" "}
          for how the paid product handles your data, or{" "}
          <Link
            href="/demo?source=tools-cloud-waste-estimator-footer"
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
