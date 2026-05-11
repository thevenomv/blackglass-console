/**
 * SEO helpers — canonical URL builder + JSON-LD schema factories.
 *
 * Centralised here so every marketing page renders consistent structured
 * data and a stable canonical URL. The factories return plain JS objects;
 * pages serialise them with `<JsonLd data={...} />` (see below).
 *
 * All schema follows schema.org. Validate any new emitter at
 * https://validator.schema.org/ before shipping.
 */

import { siteOrigin } from "@/lib/site";

/**
 * Build a fully-qualified canonical URL for the given path.
 *
 * Returns `undefined` when `NEXT_PUBLIC_APP_URL` is not configured, which
 * lets `Metadata.alternates.canonical` cleanly omit the tag (Next.js
 * tolerates an undefined value here). Production deployments always have
 * the env var set, so callers should treat the URL as present.
 *
 * @example
 *   alternates: { canonical: canonical("/pricing") }
 *   // → "https://blackglasssec.com/pricing"
 */
export function canonical(path: string): string | undefined {
  const origin = siteOrigin();
  if (!origin) return undefined;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

/** Public absolute URL of the sitewide default OG image. */
export function defaultOgImage(): string | undefined {
  const origin = siteOrigin();
  if (!origin) return undefined;
  return `${origin}/og-default.png`;
}

/**
 * Default OG image array, ready to spread into a page's
 * `metadata.openGraph.images`. Necessary because Next.js does NOT deeply
 * merge `openGraph` between layout and page — any page that declares its
 * own openGraph block wipes the layout's `images` array. Every page must
 * therefore re-declare the image to inherit the sitewide share preview.
 *
 * Returns absolute path so it works without `metadataBase` resolution
 * (Next.js still rewrites it, but absolute is robust against future
 * env-only changes).
 */
export function defaultOgImages() {
  return [
    {
      url: "/og-default.png",
      width: 1200,
      height: 630,
      alt: "Blackglass — operational integrity for Linux fleets",
    },
  ];
}

/** Same shape as `defaultOgImages` but for Twitter card metadata. */
export function defaultTwitterImages(): string[] {
  return ["/og-default.png"];
}

// ───────────────────────────────────────────────────────────────────────────
// schema.org JSON-LD factories
// ───────────────────────────────────────────────────────────────────────────

/** Bare website node — already emitted from root layout. */
export function websiteSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Blackglass",
    url: siteOrigin() ? `${siteOrigin()}/` : undefined,
  };
}

/**
 * Organisation node — gets attached to root layout next to WebSite so
 * Google can build a Knowledge Graph entity for the brand.
 */
export function organizationSchema(): Record<string, unknown> {
  const origin = siteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Blackglass",
    legalName: "Obsidian Dynamics",
    url: origin ? `${origin}/` : undefined,
    logo: origin ? `${origin}/icon.svg` : undefined,
    description:
      "Operational integrity for Linux fleets — drift detection, evidence exports, and cloud waste cleanup.",
    foundingDate: "2025",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      email: "jamie@obsidiandynamics.co.uk",
      availableLanguage: ["English"],
    },
    sameAs: [
      // Add LinkedIn / GitHub / X profile URLs here as they become public.
      // Empty arrays are fine; missing arrays trigger validator warnings.
    ],
  };
}

/**
 * SoftwareApplication node for the /product page.
 * `applicationCategory: SecurityApplication` is the canonical schema.org
 * value Google's product carousel recognises for security tooling.
 */
export function softwareApplicationSchema(opts: {
  url: string;
  pricingUrl: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Blackglass",
    applicationCategory: "SecurityApplication",
    applicationSubCategory: "Linux configuration drift detection",
    operatingSystem: "Linux (Ubuntu, Debian, RHEL, Rocky, AlmaLinux)",
    url: opts.url,
    description:
      "Detect Linux configuration drift, capture trusted baselines, and export shareable evidence bundles. Optional Charon add-on for cloud resource hygiene across DigitalOcean, AWS, and GCP.",
    publisher: {
      "@type": "Organization",
      name: "Blackglass",
      url: siteOrigin() ?? undefined,
    },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "0",
      highPrice: "2500",
      offerCount: "7",
      url: opts.pricingUrl,
    },
  };
}

/**
 * FAQPage node — populated from a list of {question, answer} pairs.
 * Used on /pricing where there's already a long FAQ section in the DOM.
 * Google requires the JSON-LD answer text to match the visible answer.
 */
export function faqPageSchema(items: Array<{ q: string; a: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a,
      },
    })),
  };
}

/**
 * Product node + nested Offer(s) for a single pricing tier.
 * Add one Product per tier on /pricing. `priceValidUntil` keeps Google
 * happy without requiring updates — set to ~1 year out, refreshed on any
 * pricing change.
 */
export function productOfferSchema(opts: {
  name: string;
  description: string;
  url: string;
  priceMonthlyUsd: number;
  priceAnnualUsd?: number;
  priceValidUntil?: string;
}): Record<string, unknown> {
  const validUntil =
    opts.priceValidUntil ??
    (() => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      return d.toISOString().slice(0, 10);
    })();

  const offers: Array<Record<string, unknown>> = [
    {
      "@type": "Offer",
      url: opts.url,
      price: String(opts.priceMonthlyUsd),
      priceCurrency: "USD",
      priceValidUntil: validUntil,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: String(opts.priceMonthlyUsd),
        priceCurrency: "USD",
        unitText: "MON",
        billingIncrement: 1,
      },
    },
  ];

  if (opts.priceAnnualUsd) {
    offers.push({
      "@type": "Offer",
      url: opts.url,
      price: String(opts.priceAnnualUsd),
      priceCurrency: "USD",
      priceValidUntil: validUntil,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: String(opts.priceAnnualUsd),
        priceCurrency: "USD",
        unitText: "ANN",
        billingIncrement: 1,
      },
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.name,
    description: opts.description,
    brand: { "@type": "Brand", name: "Blackglass" },
    offers,
  };
}

/**
 * BreadcrumbList — ordered list of navigation crumbs from the site root
 * down to the current page. Each entry is `{name, url}`. Google uses this
 * to render breadcrumb URLs in SERPs (improves CTR on mobile).
 *
 * @example
 *   breadcrumbSchema([
 *     { name: "Home",      url: "/" },
 *     { name: "Use cases", url: "/use-cases" },
 *     { name: "Linux configuration drift detection",
 *       url: "/use-cases/linux-configuration-drift-detection" },
 *   ])
 */
export function breadcrumbSchema(
  crumbs: Array<{ name: string; url: string }>,
): Record<string, unknown> {
  const origin = siteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: origin ? `${origin}${c.url}` : c.url,
    })),
  };
}

/**
 * HowTo node for step-by-step guides. `totalTime` follows ISO 8601
 * duration format (`PT12M` = 12 minutes).
 */
export function howToSchema(opts: {
  name: string;
  description: string;
  url: string;
  totalTime?: string;
  steps: Array<{ name: string; text: string; url?: string }>;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    totalTime: opts.totalTime,
    step: opts.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
      url: s.url ?? `${opts.url}#step-${i + 1}`,
    })),
  };
}
