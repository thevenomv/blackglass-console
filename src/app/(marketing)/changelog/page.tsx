import type { Metadata } from "next";
import Link from "next/link";
import {
  breadcrumbSchema,
  canonical,
  dynamicOgImages,
  dynamicTwitterImages,
} from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  CHANGELOG_ENTRIES as ENTRIES,
  CHANGELOG_KIND_LABEL,
  formatChangelogDate,
  type ChangelogKind,
} from "@/lib/changelog";

const OG = {
  title: "Changelog",
  subtitle: "Recent releases, security fixes, and product polish",
};

export const metadata: Metadata = {
  title: "Changelog · Blackglass",
  description:
    "What's new in Blackglass — recent releases, security fixes, and product polish.",
  alternates: {
    canonical: canonical("/changelog"),
    types: { "application/rss+xml": "/changelog/feed.xml" },
  },
  openGraph: {
    title: "Changelog · Blackglass",
    description:
      "What's new in Blackglass — recent releases, security fixes, and product polish.",
    type: "article",
    siteName: "Blackglass",
    url: canonical("/changelog"),
    images: dynamicOgImages(OG),
  },
  twitter: {
    card: "summary_large_image",
    title: "Changelog · Blackglass",
    description:
      "What's new in Blackglass — recent releases, security fixes, and product polish.",
    images: dynamicTwitterImages(OG),
  },
};

const KIND_CLASS: Record<ChangelogKind, string> = {
  feature: "border-accent-blue/30 bg-accent-blue/10 text-accent-blue",
  fix: "border-success/30 bg-success-soft/30 text-success",
  security: "border-danger/30 bg-danger-soft/30 text-danger",
  perf: "border-warning/30 bg-warning-soft/30 text-warning",
};

export default function ChangelogPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Changelog", url: "/changelog" },
        ])}
      />
      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-wider text-accent-blue">
          Product
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-fg-primary">Changelog</h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-fg-muted">
          What we&rsquo;ve shipped recently. We release small improvements continuously
          and group user-visible changes here for easier scanning. Want a deeper dive?{" "}
          <Link className="text-accent-blue hover:underline" href="/contact-sales">
            Ask us about a specific change
          </Link>
          .
        </p>
      </header>

      <div className="space-y-10">
        {ENTRIES.map((entry) => (
          <article
            key={entry.version}
            className="rounded-card border border-border-default bg-bg-panel p-6"
          >
            <header className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-fg-primary">
                {entry.version}
              </h2>
              <p className="text-xs text-fg-faint">{formatChangelogDate(entry.date)}</p>
            </header>
            <ul className="space-y-3">
              {entry.highlights.map((h, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-fg-muted">
                  <span
                    className={`mt-0.5 inline-flex h-5 shrink-0 items-center rounded-md border px-2 text-[10px] font-medium uppercase tracking-wider ${KIND_CLASS[h.kind]}`}
                  >
                    {CHANGELOG_KIND_LABEL[h.kind]}
                  </span>
                  <span>{h.text}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <footer className="mt-12 rounded-card border border-border-default bg-bg-panel/50 p-4 text-center text-xs text-fg-faint">
        Subscribe via{" "}
        <a
          className="text-accent-blue hover:underline"
          href="/changelog/feed.xml"
          type="application/rss+xml"
        >
          RSS
        </a>
        , or email{" "}
        <a className="text-accent-blue hover:underline" href="mailto:jamie@obsidiandynamics.co.uk">
          jamie@obsidiandynamics.co.uk
        </a>
        {" "}to be looped into release notifications.
      </footer>
    </main>
  );
}
