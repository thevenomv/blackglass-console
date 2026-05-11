import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { BLOG_POSTS, formatBlogDate } from "@/lib/blog";

const TITLE = "Blog · Blackglass";
const DESCRIPTION =
  "Engineering and product writing from the Blackglass team — drift detection, security tooling design, the SEO journey, and the rationale behind the Charon cloud janitor.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical("/blog") },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Blackglass",
    url: canonical("/blog"),
    images: dynamicOgImages({
      title: "Blog",
      subtitle: "Engineering and product writing from the Blackglass team",
    }),
  },
};

export default function BlogIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Blog", url: "/blog" },
        ])}
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Blog</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
        Engineering &amp; product writing
      </h1>
      <p className="mt-4 text-lg leading-relaxed">
        Practical posts from the Blackglass team — about drift detection, security tool design,
        and the small decisions behind a product that&rsquo;s deliberately calmer than the
        category norm. New posts when there&rsquo;s something worth saying, not on a content
        calendar.
      </p>

      <section className="mt-12 space-y-6">
        {BLOG_POSTS.map((post) => (
          <article
            key={post.slug}
            className="group rounded-card border border-border-default bg-bg-panel p-6 hover:border-accent-blue/50"
          >
            <div className="flex flex-wrap items-center gap-3 text-xs text-fg-faint">
              <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
              <span aria-hidden>·</span>
              <span>{post.readingTime}</span>
              <span aria-hidden>·</span>
              <span>
                {post.author.name}, {post.author.role}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-fg-primary group-hover:text-accent-blue">
              <Link href={`/blog/${post.slug}`}>{post.title}</Link>
            </h2>
            <p className="mt-2 text-sm leading-relaxed">{post.excerpt}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-border-default bg-bg-elevated px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-fg-faint"
                >
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <p className="mt-12 text-xs text-fg-faint">
        New to the vocabulary? See the{" "}
        <Link className="text-accent-blue hover:underline" href="/glossary">
          glossary
        </Link>
        . Subscribe to the{" "}
        <Link className="text-accent-blue hover:underline" href="/changelog/feed.xml">
          changelog RSS feed
        </Link>{" "}
        — a dedicated /blog RSS will follow once we&apos;re past a handful of posts.
      </p>
    </main>
  );
}
