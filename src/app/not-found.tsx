import type { Metadata } from "next";
import Link from "next/link";
import { marketingMailtoHref } from "@/lib/marketing/contact";

export const metadata: Metadata = {
  title: "Page not found · Blackglass",
  description:
    "The page you were looking for doesn't exist. Browse the product, pricing, use cases, free tools, or guides instead.",
  // Don't index the 404 itself, but follow the in-page links so Google
  // can re-discover canonical URLs from accidental crawl errors.
  robots: { index: false, follow: true },
};

const SECTIONS: ReadonlyArray<{
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}> = [
  {
    title: "Get started",
    links: [
      { href: "/", label: "Home" },
      { href: "/product", label: "Product tour" },
      { href: "/pricing", label: "Pricing" },
      { href: "/demo", label: "Live demo workspace" },
    ],
  },
  {
    title: "Use cases",
    links: [
      { href: "/use-cases/linux-configuration-drift-detection", label: "Linux configuration drift detection" },
      { href: "/use-cases/ssh-configuration-audit", label: "SSH configuration audit" },
      { href: "/use-cases/linux-hardening-monitoring", label: "Linux hardening monitoring" },
      { href: "/use-cases/cis-benchmark-monitoring", label: "CIS benchmark monitoring" },
    ],
  },
  {
    title: "Guides &amp; docs",
    links: [
      { href: "/guides/how-to-detect-unauthorized-linux-config-changes", label: "Guide: detect unauthorized Linux config changes" },
      { href: "/docs/api", label: "API quick start" },
      { href: "/docs/snapshot-freshness", label: "Snapshot freshness model" },
      { href: "/blog", label: "Blog" },
      { href: "/glossary", label: "Glossary (drift, baselines, RLS)" },
    ],
  },
  {
    title: "Compare",
    links: [
      { href: "/vs", label: "Compare to Wiz, Lacework, Orca" },
      { href: "/vs/wiz", label: "Blackglass vs Wiz" },
      { href: "/vs/lacework", label: "Blackglass vs Lacework" },
      { href: "/vs/orca", label: "Blackglass vs Orca" },
    ],
  },
  {
    title: "Free tools",
    links: [
      { href: "/tools/cloud-waste-estimator", label: "Cloud Waste Estimator" },
      { href: "/tools/linux-drift-risk", label: "Linux Drift Risk Score" },
      { href: "/tools/cloud-inventory-diff", label: "Cloud Inventory Diff Visualiser" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/security", label: "Security overview" },
      { href: "/changelog", label: "Changelog" },
      { href: "/status", label: "System status" },
      { href: "/recover", label: "Can't sign in?" },
    ],
  },
];

export default function NotFound() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 text-fg-muted">
      <div className="text-center">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-accent-blue">
          404
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
          Page not found
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed">
          The URL may be mistyped or the page was moved. Pick a section below — or jump
          straight to the dashboard if you&rsquo;re a logged-in user.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
          >
            Marketing home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
          >
            Fleet dashboard
          </Link>
        </div>
      </div>

      <nav
        aria-label="Site sections"
        className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className="rounded-card border border-border-default bg-bg-panel/50 p-5"
          >
            <h2
              className="text-sm font-semibold text-fg-primary"
              dangerouslySetInnerHTML={{ __html: section.title }}
            />
            <ul className="mt-3 space-y-1.5 text-sm">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-accent-blue hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <p className="mt-12 text-center text-xs text-fg-faint">
        Hit a 404 from a real link?{" "}
        <a
          href={marketingMailtoHref("Broken link on blackglasssec.com")}
          className="text-accent-blue hover:underline"
        >
          Tell us where
        </a>{" "}
        and we&rsquo;ll fix it.
      </p>
    </main>
  );
}
