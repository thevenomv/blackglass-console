import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { GLOSSARY_ENTRIES } from "@/lib/glossary";

const TITLE = "Glossary · Blackglass";
const DESCRIPTION =
  "Plain-language definitions for Linux integrity, drift, baselines, FIM, CIS, RLS, Charon, and related terms — aligned with how Blackglass uses them in product and docs.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical("/glossary") },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Blackglass",
    url: canonical("/glossary"),
    images: dynamicOgImages({
      title: "Glossary",
      subtitle: "Drift, baselines, FIM, RLS, Charon — defined for Linux teams",
    }),
  },
};

export default function GlossaryPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Glossary", url: "/glossary" },
        ])}
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Reference</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">Glossary</h1>
      <p className="mt-4 text-lg leading-relaxed">
        Shared vocabulary for security, platform, and IT teams evaluating Linux configuration
        integrity. These definitions match our public docs and console — if something reads
        differently elsewhere, this page wins.
      </p>

      <nav className="mt-10 rounded-card border border-border-default bg-bg-panel p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-faint">On this page</p>
        <ul className="mt-3 columns-1 gap-x-8 text-sm sm:columns-2">
          {GLOSSARY_ENTRIES.map((e) => (
            <li key={e.slug} className="mb-2 break-inside-avoid">
              <a className="text-accent-blue hover:underline" href={`#${e.slug}`}>
                {e.term}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-14 space-y-16">
        {GLOSSARY_ENTRIES.map((e) => (
          <article key={e.slug} id={e.slug} className="scroll-mt-24">
            <h2 className="text-xl font-semibold text-fg-primary">{e.term}</h2>
            <p className="mt-3 leading-relaxed">{e.definition}</p>
            {e.related && e.related.length > 0 ? (
              <p className="mt-4 text-sm">
                <span className="text-fg-faint">See also: </span>
                {e.related.map((r, i) => (
                  <span key={r.href}>
                    {i > 0 ? " · " : null}
                    <Link href={r.href} className="text-accent-blue hover:underline">
                      {r.label}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <section className="mt-16 rounded-card border border-border-default bg-bg-panel p-6">
        <h2 className="text-base font-semibold text-fg-primary">Go deeper</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <Link className="text-accent-blue hover:underline" href="/product">
              Product tour
            </Link>
          </li>
          <li>
            <Link className="text-accent-blue hover:underline" href="/use-cases">
              All use cases
            </Link>
          </li>
          <li>
            <Link className="text-accent-blue hover:underline" href="/blog">
              Engineering blog
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
