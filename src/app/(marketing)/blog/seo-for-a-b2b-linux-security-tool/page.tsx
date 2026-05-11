import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { formatBlogDate, getBlogPost } from "@/lib/blog";

const SLUG = "seo-for-a-b2b-linux-security-tool";
const POST = getBlogPost(SLUG)!;
const PATH = `/blog/${SLUG}`;

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
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Engineering</p>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">{POST.title}</h1>
      <p className="mt-3 text-sm text-fg-faint">
        <time dateTime={POST.date}>{formatBlogDate(POST.date)}</time> · {POST.readingTime} ·{" "}
        {POST.author.name}, {POST.author.role}
      </p>

      <p className="mt-8 text-lg leading-relaxed">
        We shipped the SEO surface for{" "}
        <Link className="text-accent-blue hover:underline" href="/">
          blackglasssec.com
        </Link>{" "}
        in two passes over a week. Bucket A was the obvious P0 stuff every B2B site needs:
        canonicals, structured data, OG images, a real sitemap. Bucket B was the engineering
        scaffolding that keeps it from rotting: unit tests for the schema factories, a smoke test
        that grep&rsquo;s every marketing page for the contract, and a strategy doc so future
        contributors don&rsquo;t re-relearn the same lessons.
      </p>
      <p className="mt-4 leading-relaxed">
        The headline was learning that Next.js&rsquo;s metadata system{" "}
        <em>doesn&rsquo;t deeply merge</em> page-level <code>openGraph</code> into the layout&rsquo;s
        — page wins, layout dies. We had pages with rich titles and descriptions but no{" "}
        <code>og:image</code> for two days because the layout image was being silently dropped. The
        fix was a one-liner per page (<code>images: defaultOgImages()</code>) but the test that
        catches it next time is the more interesting artefact.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        Why structured data first
      </h2>
      <p className="mt-3 leading-relaxed">
        For a B2B Linux tool, the audience that finds you through search is overwhelmingly people
        researching a category — &ldquo;Linux drift detection&rdquo;, &ldquo;file integrity
        monitoring tools&rdquo;, &ldquo;sshd_config audit&rdquo;. They&rsquo;re going to read a
        SERP page and decide whether to click through based on three things: title, description,
        and any rich snippets Google chooses to render (FAQ accordion, breadcrumb, price band,
        review stars).
      </p>
      <p className="mt-4 leading-relaxed">
        Most of those rich snippets are gated on schema.org structured data. So before optimising
        copy or chasing keywords, we shipped:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          <code>WebSite</code> + <code>Organization</code> at the layout level so the brand has a
          Knowledge Graph entity.
        </li>
        <li>
          <code>SoftwareApplication</code> on{" "}
          <Link className="text-accent-blue hover:underline" href="/product">
            /product
          </Link>{" "}
          so we&rsquo;re eligible for the security-tool carousel.
        </li>
        <li>
          <code>Product</code> + <code>Offer</code> per pricing tier on{" "}
          <Link className="text-accent-blue hover:underline" href="/pricing">
            /pricing
          </Link>{" "}
          so prices can render in SERPs without scraping.
        </li>
        <li>
          <code>FAQPage</code> on the same /pricing page so the existing 15-question FAQ has a shot
          at the accordion-style snippet.
        </li>
        <li>
          <code>HowTo</code> on the practical guide at{" "}
          <Link
            className="text-accent-blue hover:underline"
            href="/guides/how-to-detect-unauthorized-linux-config-changes"
          >
            /guides/how-to-detect-unauthorized-linux-config-changes
          </Link>{" "}
          — eligible for the steps carousel.
        </li>
        <li>
          <code>BreadcrumbList</code> on every page so SERPs show the trail instead of just the
          URL.
        </li>
      </ul>
      <p className="mt-4 leading-relaxed">
        Every emitter is a typed factory in <code>src/lib/seo.ts</code> with unit tests against
        the required fields. We don&rsquo;t hand-roll JSON-LD blocks anywhere; they go through a
        single <code>&lt;JsonLd /&gt;</code> wrapper component that handles{" "}
        <code>suppressHydrationWarning</code> and gives each block a stable id for DOM debugging.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        Per-route lastmod, not a single build timestamp
      </h2>
      <p className="mt-3 leading-relaxed">
        The default Next.js sitemap example uses <code>new Date()</code> for every URL. Every URL
        gets the same <code>&lt;lastmod&gt;</code>, the freshness signal collapses, and a typo fix
        in a utility makes the entire site look stale-then-fresh.
      </p>
      <p className="mt-4 leading-relaxed">
        We resolve <code>lastmod</code> per route via <code>git log -1 --format=%cI -- &lt;file&gt;</code>{" "}
        with a file-mtime fallback for ephemeral build environments. It&rsquo;s ~30 lines of code
        in <code>src/app/sitemap.ts</code> and Google sees per-page freshness exactly as we intend.
        For a marketing site that has a high-touch <code>/changelog</code> and otherwise-stable
        legal pages, that distinction matters.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        Dynamic OG images via a single edge endpoint
      </h2>
      <p className="mt-3 leading-relaxed">
        Next.js supports both per-route <code>opengraph-image.tsx</code> and a single endpoint
        approach. We chose the endpoint at <code>/api/og?title=&hellip;&amp;subtitle=&hellip;</code>{" "}
        for three reasons:
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          Brand styling lives in one file. Future rebrand is one PR, not 30.
        </li>
        <li>Pages opt in by passing two strings — no extra file per route.</li>
        <li>
          The CDN cache key is the URL, so any title change naturally invalidates the cache. No
          revalidation rituals.
        </li>
      </ol>
      <p className="mt-4 leading-relaxed">
        The static <code>/og-default.png</code> remains as a fallback for pages that don&rsquo;t
        opt in (legal pages, redirect targets). The four flagship pages — home, /pricing, /product,
        the how-to guide — all use the dynamic version because their share-card title is the
        actual selling line.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        The test that catches the regression we shipped
      </h2>
      <p className="mt-3 leading-relaxed">
        Bucket B added <code>tests/unit/marketing-page-seo.test.ts</code>: a smoke test that walks
        every <code>page.tsx</code> under <code>src/app/(marketing)/</code> and asserts the
        contract per page. Canonical declared. OG image included if the page overrides{" "}
        <code>openGraph</code>. <code>&lt;h1&gt;</code> rendered. No raw{" "}
        <code>&lt;script type=&quot;application/ld+json&quot;&gt;</code> tags (must use the wrapper
        component).
      </p>
      <p className="mt-4 leading-relaxed">
        It catches the regression I shipped on day one, plus three others I hadn&rsquo;t noticed:
        the four <code>/tools/*</code> pages had <code>&lt;h2&gt;</code> for the page title with
        no <code>&lt;h1&gt;</code> at all, and the auth surfaces (<code>/sign-in</code>,{" "}
        <code>/sign-up</code>) had no <code>noindex</code> directive — they were eligible to
        compete with <code>/recover</code> for the &ldquo;blackglass sign in&rdquo; query.
      </p>
      <p className="mt-4 leading-relaxed">
        The interesting bit is the per-route exceptions: home, demo subpages,{" "}
        <code>/sign-in/[[...sign-in]]</code>,{" "}
        <code>/sign-up/[[...sign-up]]</code>, <code>/passphrase-recovery</code>, and{" "}
        <code>/pricing/success</code> each opt out of one or more checks with a documented one-line
        reason. The reason surfaces in test failures so a future contributor either accepts the
        opt-out or challenges it. Documenting the &ldquo;why&rdquo; in code is one of the small
        habits that compounds.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        What we deliberately didn&rsquo;t do
      </h2>
      <p className="mt-3 leading-relaxed">
        For an early-stage B2B tool, the temptation is to chase tactics that look like
        progress but actually don&rsquo;t move the needle:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="text-fg-primary">No backlink buying or PBNs.</strong> The audience is
          security engineers; if they smell a fake DR boost they will judge the product by it.
        </li>
        <li>
          <strong className="text-fg-primary">No AI-generated SEO content.</strong> Engineers
          recognise it instantly and bounce. We&rsquo;d rather ship four good pages than forty
          mediocre ones.
        </li>
        <li>
          <strong className="text-fg-primary">No keyword-stuffed comparison pages.</strong> The{" "}
          <Link className="text-accent-blue hover:underline" href="/vs">
            /vs
          </Link>{" "}
          pages are honest about where competitors fit and where Blackglass does. Most prospects
          end up keeping their CNAPP and adding us, not switching.
        </li>
        <li>
          <strong className="text-fg-primary">No console / app routes in the sitemap.</strong> The
          authenticated app is <code>noindex</code> at the route group level. Indexing it would
          just teach Google about UI it can&rsquo;t see.
        </li>
      </ul>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">What&rsquo;s next</h2>
      <p className="mt-3 leading-relaxed">
        The marketing-side follow-up — Search Console verification, sitemap submission, manual
        URL inspection requests, social-cache flushes — lives on{" "}
        <a
          className="text-accent-blue hover:underline"
          href="https://github.com/thevenomv/blackglass-console"
          rel="nofollow noopener"
          target="_blank"
        >
          our private follow-up canvas
        </a>{" "}
        because it requires our Google account. The engineering side is mostly done; future work
        is opportunistic — drafting a comparison page when a real prospect asks for one,
        publishing a use-case page when we hit a category we can speak to with credibility.
      </p>
      <p className="mt-4 leading-relaxed">
        If you found this useful and want to see the actual code,{" "}
        <Link className="text-accent-blue hover:underline" href="/contact-sales">
          drop us a line
        </Link>{" "}
        — we&rsquo;ll happily walk you through the patterns. The whole audit is also documented in{" "}
        <code>docs/seo.md</code> in the repo (semi-public; ask if you&rsquo;d like a pointer).
      </p>

      <div className="mt-12 rounded-card border border-accent-blue/40 bg-accent-blue/5 p-6">
        <h2 className="text-base font-semibold text-fg-primary">
          Try the product the post is about
        </h2>
        <p className="mt-2 text-sm leading-relaxed">
          Blackglass watches Linux fleets for configuration drift, exports auditor-grade evidence,
          and includes an optional cloud-waste cleanup add-on. 14-day trial, no card.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
          >
            Open the demo workspace
          </Link>
          <Link
            href="/product"
            className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
          >
            See the product
          </Link>
        </div>
      </div>
    </main>
  );
}
