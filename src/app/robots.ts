import type { MetadataRoute } from "next";
import { siteOrigin, siteShouldNoindex } from "@/lib/site";

/**
 * `robots.txt` policy.
 *
 * Default rule: allow everything except internal API/monitoring paths and
 * post-checkout success URLs (which carry session-specific Stripe data
 * and should never be indexed).
 *
 * AI / LLM crawlers get the same default-allow as Googlebot — Blackglass
 * actively wants to be cited inside Perplexity, Claude, and ChatGPT
 * answers because the buyer demographic increasingly starts vendor
 * research inside an LLM. We surface a curated entry point at /llms.txt
 * (see `src/app/llms.txt/route.ts`) but do not block raw crawling, since
 * blocking GPTBot just means we get summarised from second-hand sources
 * with worse fidelity. If a specific bot becomes abusive, add an
 * explicit `disallow` block here rather than wholesale-blocking AI
 * crawlers.
 *
 * `/api/og` is explicitly allowed even though `/api/` is otherwise
 * disallowed — Twitter/Facebook/LinkedIn need to fetch the dynamic OG
 * image directly, and Googlebot uses it for image-search context.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();

  if (siteShouldNoindex()) {
    return {
      rules: { userAgent: "*", disallow: ["/"] },
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/og"],
        disallow: ["/api/", "/monitoring", "/pricing/success"],
      },
    ],
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
    ...(origin ? { host: origin.replace(/^https?:\/\//, "") } : {}),
  };
}
