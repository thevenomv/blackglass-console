/**
 * Source of truth for the /blog index.
 *
 * Each entry corresponds to a `src/app/(marketing)/blog/<slug>/page.tsx`.
 * The post page renders the actual content (long-form, custom layout per
 * post — we don't try to be Medium). This module just powers the index
 * cards, sitemap entry, and any future RSS feed.
 *
 * Add posts in newest-first order. Slug must match the page directory.
 *
 * If post count grows past ~12, consider:
 *   - Lifting content to MDX with `next-mdx-remote`.
 *   - Adding a /blog/feed.xml RSS feed (mirror /changelog/feed.xml).
 *   - Tag-based filtering on the index (we already capture tags below).
 */

export interface BlogPost {
  readonly slug: string;
  readonly title: string;
  /** One sentence used as both meta description and index excerpt. */
  readonly excerpt: string;
  /** ISO date `YYYY-MM-DD` — published / last meaningful update. */
  readonly date: string;
  readonly readingTime: string;
  readonly tags: ReadonlyArray<string>;
  readonly author: {
    readonly name: string;
    readonly role: string;
  };
}

export const BLOG_POSTS: ReadonlyArray<BlogPost> = [
  {
    slug: "seo-for-a-b2b-linux-security-tool",
    title: "How we approached SEO for a B2B Linux security tool (without buying any backlinks)",
    excerpt:
      "What it actually takes to ship credible structured data, dynamic OG images, and a sitemap that respects per-page freshness — for an engineering audience that distrusts marketing.",
    date: "2026-05-11",
    readingTime: "~9 min read",
    tags: ["engineering", "seo", "marketing"],
    author: {
      name: "Jamie",
      role: "Founder, Blackglass",
    },
  },
  {
    slug: "charon-design-rationale",
    title: "Charon: why we built a cloud janitor inside a Linux integrity tool",
    excerpt:
      "The product reasoning behind Charon — a paid add-on that scans cloud accounts for waste — and why it's the right shape for a tool that's primarily about server-side configuration drift.",
    date: "2026-05-09",
    readingTime: "~7 min read",
    tags: ["product", "engineering", "charon"],
    author: {
      name: "Jamie",
      role: "Founder, Blackglass",
    },
  },
];

/** Lookup helper for the dynamic-route post pages. */
export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

/** Format an ISO date as the human-friendly form shown on the blog index. */
export function formatBlogDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
