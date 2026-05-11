import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { articleSchema, breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { formatBlogDate, getBlogPost } from "@/lib/blog";

const SLUG = "row-level-security-tenant-isolation";
const POST = getBlogPost(SLUG)!;
const PATH = `/blog/${SLUG}`;
const POST_URL = canonical(PATH) ?? PATH;

export const metadata: Metadata = {
  title: `${POST.title} · Blackglass`,
  description: POST.excerpt,
  alternates: { canonical: canonical(PATH) },
  openGraph: {
    title: POST.title,
    description: POST.excerpt,
    type: "article",
    siteName: "Blackglass",
    url: canonical(PATH),
    publishedTime: POST.date,
    authors: [POST.author.name],
    tags: [...POST.tags],
    images: dynamicOgImages({
      title: POST.title,
      subtitle: `${POST.readingTime} · ${POST.author.name}`,
    }),
  },
};

export default function Post() {
  return (
    <main className="guide-article mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Blog", url: "/blog" },
          { name: POST.title, url: PATH },
        ])}
      />
      <JsonLd
        id="schema-article"
        data={articleSchema({
          url: POST_URL,
          headline: POST.title,
          description: POST.excerpt,
          datePublished: POST.date,
          author: POST.author,
          tags: POST.tags,
        })}
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Security</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">{POST.title}</h1>
      <p className="mt-3 text-sm text-fg-faint">
        <time dateTime={POST.date}>{formatBlogDate(POST.date)}</time> · {POST.readingTime} ·{" "}
        {POST.author.name}, {POST.author.role}
      </p>

      <p className="mt-8 text-lg leading-relaxed">
        Multi-tenant SaaS lives or dies on one invariant: tenant A&apos;s rows never appear in
        tenant B&apos;s queries. Application-level filters are necessary but not sufficient —
        one missed <code className="font-mono text-accent-blue">WHERE workspace_id = ?</code> in a
        new code path becomes a breach. Postgres row-level security (RLS) is our backstop: the
        database refuses illegal reads and writes even when application code regresses.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Greppable bypasses</h2>
      <p className="mt-3 leading-relaxed">
        Some jobs legitimately cross tenant boundaries — billing reconciliation, support with
        explicit customer consent, migration scripts. Those paths use a tiny audited helper and
        every callsite is tagged <code className="font-mono text-accent-blue">// RLS-BYPASS:&lt;reason&gt;</code>{" "}
        so security review and CI grep stay honest. If you are evaluating us, ask for the bypass
        inventory; it should be boringly small.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">What RLS does not fix</h2>
      <p className="mt-3 leading-relaxed">
        Compromised database superuser credentials bypass RLS by definition. Supply-chain attacks
        on dependencies bypass RLS. Human operators pasting production data into Slack bypass RLS.
        We still encrypt at rest, minimise retention, and run SAST in CI — RLS is one layer, not
        the whole story. The{" "}
        <Link className="text-accent-blue hover:underline" href="/security">
          security overview
        </Link>{" "}
        walks the full stack.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Related</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
        <li>
          <Link className="text-accent-blue hover:underline" href="/glossary#row-level-security">
            Glossary: row-level security (RLS)
          </Link>
        </li>
        <li>
          <Link className="text-accent-blue hover:underline" href="/blog/seo-for-a-b2b-linux-security-tool">
            How we approached SEO (and tests that grep for JsonLd)
          </Link>
        </li>
      </ul>
    </main>
  );
}
