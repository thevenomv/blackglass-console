import type { Metadata } from "next";
import Link from "next/link";
import { CloudInventoryDiffClient } from "@/components/tools/CloudInventoryDiffClient";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical } from "@/lib/seo";

const PATH = "/tools/cloud-inventory-diff";
const TITLE = "Cloud Inventory Diff Visualiser — Blackglass Tools";
const DESCRIPTION =
  "Compare two cloud inventory exports and see what was added, removed, or changed. Browser-only — files never leave your device.";

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

const SAMPLE_SCHEMA = `{
  "snapshot_id": "before-cleanup-2026-05-09",
  "captured_at": "2026-05-09T08:00:00Z",
  "provider": "do",
  "resources": [
    {
      "kind": "droplet",
      "id": "12345678",
      "region": "lon1",
      "size": "s-2vcpu-4gb",
      "tags": ["staging", "bg-managed"]
    },
    {
      "kind": "volume",
      "id": "vol-abc",
      "size_gb": 100,
      "attached_to": "12345678"
    },
    {
      "kind": "snapshot",
      "id": "snap-xyz",
      "size_gb": 40,
      "created_at": "2025-08-12T10:14:00Z"
    }
  ]
}`;

export default function CloudInventoryDiffPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:py-14">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Tools", url: "/tools" },
          { name: "Cloud Inventory Diff Visualiser", url: PATH },
        ])}
      />
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-fg-primary">Cloud Inventory Diff Visualiser</h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{DESCRIPTION}</p>
        <p className="mt-3 rounded-card border border-accent-blue/25 bg-accent-blue/5 px-4 py-3 text-xs leading-relaxed text-fg-muted">
          A pre-scan planning tool aligned with{" "}
          <Link href="/product#charon" className="text-accent-blue hover:underline">
            Charon in Blackglass
          </Link>{" "}
          — drop two JSON inventory exports to see structural changes (added, removed, changed).
          For continuous multi-cloud diffs with idle scoring and approval-gated cleanup, use Charon
          itself.
        </p>
        <p className="mt-3 rounded-card border border-border-subtle bg-bg-panel/60 px-4 py-3 text-xs leading-relaxed text-fg-muted">
          <span className="font-semibold text-fg-primary">Privacy:</span> files are parsed in your
          browser via the FileReader API and discarded immediately. No upload, no storage, no
          credentials — the schema only carries opaque resource IDs you choose to export.
        </p>
      </header>

      <CloudInventoryDiffClient />

      <section
        aria-labelledby="schema-preview"
        className="mt-10 rounded-card border border-border-default bg-bg-panel p-6"
      >
        <h3 id="schema-preview" className="text-sm font-semibold text-fg-primary">
          Expected JSON shape
        </h3>
        <p className="mt-1 text-xs text-fg-faint">
          The same shape Charon emits, simplified for hand-rolled exports. Add the resource kinds
          you care about; missing fields are tolerated, extra fields are preserved.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-border-subtle bg-bg-base p-4 text-[12px] leading-relaxed text-fg-primary">
          <code>{SAMPLE_SCHEMA}</code>
        </pre>
      </section>

      <section
        aria-labelledby="trust-note"
        className="mt-6 rounded-card border border-border-default bg-bg-panel px-5 py-4 text-xs leading-relaxed text-fg-muted"
      >
        <h3 id="trust-note" className="text-sm font-semibold text-fg-primary">
          What this tool does — and doesn&rsquo;t
        </h3>
        <ul className="mt-2 space-y-1.5">
          <li>
            <span className="text-fg-primary">Structural diff only.</span> No idle scoring, no cost
            attribution, no remediation hints — those need live signal Charon collects directly.
          </li>
          <li>
            <span className="text-fg-primary">Tolerant by design.</span> Resources missing
            <code className="mx-1 rounded bg-bg-elevated px-1 font-mono text-[11px]">kind</code> or
            <code className="mx-1 rounded bg-bg-elevated px-1 font-mono text-[11px]">id</code> are
            skipped instead of failing the parse — easier to use with hand-rolled JSON.
          </li>
          <li>
            <span className="text-fg-primary">Browser-only.</span> Both files are read with the
            FileReader API and discarded after parse. Nothing is uploaded, logged, or stored.
          </li>
        </ul>
        <p className="mt-3 text-fg-faint">
          Powered by Blackglass · See the{" "}
          <Link href="/security" className="text-accent-blue hover:underline">
            security overview
          </Link>{" "}
          for how the paid product handles inventory data, or{" "}
          <Link
            href="/demo?source=tools-cloud-inventory-diff-footer"
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
