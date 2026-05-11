import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { articleSchema, breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { formatBlogDate, getBlogPost } from "@/lib/blog";

const SLUG = "snapshot-freshness-for-linux-evidence";
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
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Operations</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">{POST.title}</h1>
      <p className="mt-3 text-sm text-fg-faint">
        <time dateTime={POST.date}>{formatBlogDate(POST.date)}</time> · {POST.readingTime} ·{" "}
        {POST.author.name}, {POST.author.role}
      </p>

      <p className="mt-8 text-lg leading-relaxed">
        Blackglass is not a real-time IDS. It is a scheduled (or push-triggered) integrity
        product — which means every finding carries a timestamp that really means &ldquo;as of
        the last successful scan&rdquo;. That is good enough for change control and most incident
        triage, but only if we are honest about the lag. This post explains how we document
        freshness, why auditors ask, and where the hard limits sit.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">What &ldquo;fresh&rdquo; means here</h2>
      <p className="mt-3 leading-relaxed">
        For each host we show last check-in time, last successful scan completion, and the
        baseline version the diff ran against. The console never implies sub-second visibility
        unless you are on a tier that supports continuous collection and the agent is actually
        heartbeating. When a push agent misses windows, the UI surfaces stale state explicitly —
        greyed rows, banners, and webhook payloads that include the same metadata so automation
        does not silently assume freshness.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Why this shows up in audits</h2>
      <p className="mt-3 leading-relaxed">
        ITGC reviewers increasingly ask: &ldquo;if this screenshot was taken at 14:32, how do we
        know the server had not changed at 14:31?&rdquo; The answer is always contractual: you
        either claim continuous instrumentation, or you claim bounded staleness. We chose the
        latter and wrote it down in the public{" "}
        <Link className="text-accent-blue hover:underline" href="/docs/snapshot-freshness">
          snapshot freshness
        </Link>{" "}
        doc so security teams can paste a link into the evidence pack instead of inventing prose
        in Word.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">Related</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
        <li>
          <Link className="text-accent-blue hover:underline" href="/glossary#snapshot-freshness">
            Glossary: snapshot freshness
          </Link>
        </li>
        <li>
          <Link className="text-accent-blue hover:underline" href="/use-cases/incident-response-baselines">
            Use case: incident response baselines
          </Link>
        </li>
      </ul>
    </main>
  );
}
