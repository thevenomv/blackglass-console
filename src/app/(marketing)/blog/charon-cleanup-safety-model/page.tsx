import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { articleSchema, breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { formatBlogDate, getBlogPost } from "@/lib/blog";

const SLUG = "charon-cleanup-safety-model";
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
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Charon</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">{POST.title}</h1>
      <p className="mt-3 text-sm text-fg-faint">
        <time dateTime={POST.date}>{formatBlogDate(POST.date)}</time> · {POST.readingTime} ·{" "}
        {POST.author.name}, {POST.author.role}
      </p>

      <p className="mt-8 text-lg leading-relaxed">
        Cloud cost tools that auto-delete resources burn trust exactly once. Charon is
        deliberately boring: inventory first, conservative scoring, tag-based protect lists, and
        a human approval gate before any destructive API call. This post is the checklist we give
        internal reviewers when they ask &ldquo;what if Charon nukes prod?&rdquo;
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Read-only is the default posture</h2>
      <p className="mt-3 leading-relaxed">
        Linking a cloud account starts with inventory-only scopes. Live cleanup requires a
        separate credential, per-account opt-in, and an explicit toggle in workspace settings.
        Until all three are true, Charon will happily show waste — it will not act on it.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Protect lists beat post-hoc suppression</h2>
      <p className="mt-3 leading-relaxed">
        Resources matching your protect tags never enter the proposal queue. Suppressing at
        delete-time is too late; the operator already saw noise. We would rather miss a marginal
        finding than train people to click through warnings.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Versioned webhooks</h2>
      <p className="mt-3 leading-relaxed">
        Outbound scan webhooks include an explicit schema version so downstream automation can pin
        to a known shape. Cloud integrations rot quietly; versioning makes the rot visible.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Related</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
        <li>
          <Link className="text-accent-blue hover:underline" href="/blog/charon-design-rationale">
            Charon design rationale (longer product story)
          </Link>
        </li>
        <li>
          <Link className="text-accent-blue hover:underline" href="/glossary#charon">
            Glossary: Charon
          </Link>
        </li>
        <li>
          <Link className="text-accent-blue hover:underline" href="/tools/cloud-waste-estimator">
            Public cloud waste estimator (no credentials)
          </Link>
        </li>
      </ul>
    </main>
  );
}
