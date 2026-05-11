import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Unit tests for `src/lib/seo.ts`.
 *
 * Locks the public surface of the SEO helpers so layout / metadata changes
 * can't silently break canonical URLs or JSON-LD payloads. We test against
 * a stable origin (`https://example.test`) to keep assertions deterministic
 * regardless of which env the tests run in.
 */

const ORIGIN = "https://example.test";

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("seo.canonical", () => {
  it("prepends origin and preserves the path", async () => {
    const { canonical } = await import("@/lib/seo");
    expect(canonical("/pricing")).toBe(`${ORIGIN}/pricing`);
  });

  it("normalises a path missing the leading slash", async () => {
    const { canonical } = await import("@/lib/seo");
    expect(canonical("pricing")).toBe(`${ORIGIN}/pricing`);
  });

  it("returns undefined when origin is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    // re-import fresh so siteOrigin re-reads env
    const fresh = await import(`@/lib/seo?ts=${Date.now()}`);
    expect(fresh.canonical("/pricing")).toBeUndefined();
  });

  it("survives query strings without re-encoding", async () => {
    const { canonical } = await import("@/lib/seo");
    expect(canonical("/use-cases?utm=x")).toBe(`${ORIGIN}/use-cases?utm=x`);
  });
});

describe("seo.defaultOgImages / defaultTwitterImages", () => {
  it("returns the canonical 1200x630 share card by default", async () => {
    const { defaultOgImages } = await import("@/lib/seo");
    const imgs = defaultOgImages();
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toEqual({
      url: "/og-default.png",
      width: 1200,
      height: 630,
      alt: "Blackglass — operational integrity for Linux fleets",
    });
  });

  it("Twitter helper points at the same asset (single string array)", async () => {
    const { defaultTwitterImages } = await import("@/lib/seo");
    expect(defaultTwitterImages()).toEqual(["/og-default.png"]);
  });
});

describe("seo.dynamicOgImages", () => {
  it("URL-encodes the title and subtitle into /api/og", async () => {
    const { dynamicOgImages } = await import("@/lib/seo");
    const [img] = dynamicOgImages({
      title: "Pricing & Plans",
      subtitle: "From $59/mo",
    });
    expect(img.url).toMatch(/^\/api\/og\?/);
    expect(img.url).toContain("title=Pricing+%26+Plans");
    expect(img.url).toContain("subtitle=From+%2459%2Fmo");
    expect(img.width).toBe(1200);
    expect(img.height).toBe(630);
  });

  it("derives a default alt text from the title", async () => {
    const { dynamicOgImages } = await import("@/lib/seo");
    const [img] = dynamicOgImages({ title: "Pricing", subtitle: "x" });
    expect(img.alt).toBe("Blackglass — Pricing");
  });

  it("respects an explicit alt override", async () => {
    const { dynamicOgImages } = await import("@/lib/seo");
    const [img] = dynamicOgImages({ title: "x", subtitle: "y", alt: "Custom" });
    expect(img.alt).toBe("Custom");
  });

  it("dynamicTwitterImages returns the same path as dynamicOgImages", async () => {
    const { dynamicOgImages, dynamicTwitterImages } = await import("@/lib/seo");
    const [og] = dynamicOgImages({ title: "x", subtitle: "y" });
    const [tw] = dynamicTwitterImages({ title: "x", subtitle: "y" });
    expect(tw).toBe(og.url);
  });
});

describe("seo.organizationSchema", () => {
  it("emits a schema.org Organization node with required fields", async () => {
    const { organizationSchema } = await import("@/lib/seo");
    const s = organizationSchema();
    expect(s["@context"]).toBe("https://schema.org");
    expect(s["@type"]).toBe("Organization");
    expect(s.name).toBe("Blackglass");
    expect(s.url).toBe(`${ORIGIN}/`);
    expect(s.logo).toBe(`${ORIGIN}/icon.svg`);
    expect((s.contactPoint as Record<string, unknown>)["@type"]).toBe("ContactPoint");
  });
});

describe("seo.websiteSchema", () => {
  it("emits a WebSite node with the site origin", async () => {
    const { websiteSchema } = await import("@/lib/seo");
    const s = websiteSchema();
    expect(s["@type"]).toBe("WebSite");
    expect(s.url).toBe(`${ORIGIN}/`);
  });
});

describe("seo.softwareApplicationSchema", () => {
  it("emits a SecurityApplication offer block", async () => {
    const { softwareApplicationSchema } = await import("@/lib/seo");
    const s = softwareApplicationSchema({
      url: `${ORIGIN}/product`,
      pricingUrl: `${ORIGIN}/pricing`,
    });
    expect(s["@type"]).toBe("SoftwareApplication");
    expect(s.applicationCategory).toBe("SecurityApplication");
    expect(s.operatingSystem).toMatch(/Linux/);
    const offers = s.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.priceCurrency).toBe("USD");
    expect(offers.url).toBe(`${ORIGIN}/pricing`);
  });
});

describe("seo.faqPageSchema", () => {
  it("wraps Q/A pairs in mainEntity Question / Answer items", async () => {
    const { faqPageSchema } = await import("@/lib/seo");
    const s = faqPageSchema([
      { q: "Is there a free tier?", a: "Yes — Lab is free forever." },
      { q: "How does pricing work?", a: "Per-seat with a host quota." },
    ]);
    expect(s["@type"]).toBe("FAQPage");
    const items = s.mainEntity as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]["@type"]).toBe("Question");
    expect(items[0].name).toBe("Is there a free tier?");
    expect((items[0].acceptedAnswer as Record<string, unknown>).text).toBe(
      "Yes — Lab is free forever.",
    );
  });

  it("handles an empty FAQ list gracefully", async () => {
    const { faqPageSchema } = await import("@/lib/seo");
    const s = faqPageSchema([]);
    expect(s.mainEntity).toEqual([]);
  });
});

describe("seo.productOfferSchema", () => {
  it("emits a Product node with a single monthly Offer when no annual price is given", async () => {
    const { productOfferSchema } = await import("@/lib/seo");
    const s = productOfferSchema({
      name: "Starter",
      description: "Entry tier",
      url: `${ORIGIN}/pricing#starter`,
      priceMonthlyUsd: 59,
    });
    expect(s["@type"]).toBe("Product");
    expect(s.name).toBe("Starter");
    const offers = s.offers as Array<Record<string, unknown>>;
    expect(offers).toHaveLength(1);
    expect(offers[0].price).toBe("59");
    expect(offers[0].priceCurrency).toBe("USD");
    expect(offers[0].availability).toBe("https://schema.org/InStock");
  });

  it("emits monthly + annual offers when both prices are supplied", async () => {
    const { productOfferSchema } = await import("@/lib/seo");
    const s = productOfferSchema({
      name: "Scale",
      description: "Large-fleet tier",
      url: `${ORIGIN}/pricing#scale`,
      priceMonthlyUsd: 599,
      priceAnnualUsd: 5990,
    });
    const offers = s.offers as Array<Record<string, unknown>>;
    expect(offers).toHaveLength(2);
    expect(offers[0].price).toBe("599");
    expect(offers[1].price).toBe("5990");
    expect(
      (offers[1].priceSpecification as Record<string, unknown>).unitText,
    ).toBe("ANN");
  });

  it("auto-generates priceValidUntil ~1 year out when not supplied", async () => {
    const { productOfferSchema } = await import("@/lib/seo");
    const s = productOfferSchema({
      name: "x",
      description: "y",
      url: "z",
      priceMonthlyUsd: 1,
    });
    const offers = s.offers as Array<Record<string, unknown>>;
    const validUntil = String(offers[0].priceValidUntil);
    expect(validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const oneYearOut = new Date();
    oneYearOut.setUTCFullYear(oneYearOut.getUTCFullYear() + 1);
    expect(validUntil.slice(0, 4)).toBe(String(oneYearOut.getUTCFullYear()));
  });
});

describe("seo.breadcrumbSchema", () => {
  it("numbers crumbs from 1 and prefixes URLs with the origin", async () => {
    const { breadcrumbSchema } = await import("@/lib/seo");
    const s = breadcrumbSchema([
      { name: "Home", url: "/" },
      { name: "Use cases", url: "/use-cases" },
      { name: "SSH audit", url: "/use-cases/ssh-configuration-audit" },
    ]);
    expect(s["@type"]).toBe("BreadcrumbList");
    const items = s.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0].position).toBe(1);
    expect(items[0].item).toBe(`${ORIGIN}/`);
    expect(items[2].position).toBe(3);
    expect(items[2].item).toBe(`${ORIGIN}/use-cases/ssh-configuration-audit`);
  });

  it("falls back to relative URLs when the origin is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const fresh = await import(`@/lib/seo?ts=${Date.now() + 1}`);
    const s = fresh.breadcrumbSchema([{ name: "Home", url: "/" }]);
    const items = s.itemListElement as Array<Record<string, unknown>>;
    expect(items[0].item).toBe("/");
  });
});

describe("seo.howToSchema", () => {
  it("emits a HowTo node with positioned steps and per-step anchors", async () => {
    const { howToSchema } = await import("@/lib/seo");
    const s = howToSchema({
      name: "Detect drift",
      description: "Six-step guide",
      url: `${ORIGIN}/guides/detect-drift`,
      totalTime: "PT12M",
      steps: [
        { name: "Capture baseline", text: "Snapshot your fleet today." },
        { name: "Schedule scans", text: "Pick a daily cadence." },
      ],
    });
    expect(s["@type"]).toBe("HowTo");
    expect(s.totalTime).toBe("PT12M");
    const steps = s.step as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(2);
    expect(steps[0].position).toBe(1);
    expect(steps[0].url).toBe(`${ORIGIN}/guides/detect-drift#step-1`);
    expect(steps[1].url).toBe(`${ORIGIN}/guides/detect-drift#step-2`);
  });

  it("respects an explicit per-step URL when supplied", async () => {
    const { howToSchema } = await import("@/lib/seo");
    const s = howToSchema({
      name: "x",
      description: "y",
      url: `${ORIGIN}/g`,
      steps: [{ name: "x", text: "y", url: `${ORIGIN}/elsewhere` }],
    });
    expect((s.step as Array<Record<string, unknown>>)[0].url).toBe(
      `${ORIGIN}/elsewhere`,
    );
  });
});

describe("seo.articleSchema", () => {
  it("emits Article with Person author and Organization publisher", async () => {
    const { articleSchema } = await import("@/lib/seo");
    const s = articleSchema({
      url: `${ORIGIN}/blog/example`,
      headline: "Example post",
      description: "One line summary.",
      datePublished: "2026-05-01",
      author: { name: "Jamie", role: "Founder" },
      tags: ["engineering", "security"],
    });
    expect(s["@type"]).toBe("Article");
    expect(s.headline).toBe("Example post");
    const author = s.author as Record<string, unknown>;
    expect(author["@type"]).toBe("Person");
    expect(author.name).toBe("Jamie");
    expect(author.jobTitle).toBe("Founder");
    const publisher = s.publisher as Record<string, unknown>;
    expect(publisher["@type"]).toBe("Organization");
    expect(publisher.name).toBe("Blackglass");
    expect(s.keywords).toBe("engineering, security");
  });

  it("truncates headlines over 110 characters with an ellipsis", async () => {
    const { articleSchema } = await import("@/lib/seo");
    const long = "x".repeat(120);
    const s = articleSchema({
      url: `${ORIGIN}/blog/long`,
      headline: long,
      description: "d",
      datePublished: "2026-05-01",
      author: { name: "A" },
    });
    expect((s.headline as string).length).toBe(108);
    expect(s.headline).toMatch(/…$/);
  });
});

describe("seo schema JSON-serialisability", () => {
  /**
   * Every factory returns objects that get embedded inside a
   * <script type="application/ld+json"> block via JSON.stringify. If any
   * factory returns something with circular refs, BigInts, or undefined
   * properties at the wrong level, that script tag breaks at runtime.
   * This test guards every emitter at once.
   */
  it("all schema factories produce valid JSON", async () => {
    const seo = await import("@/lib/seo");
    const samples: Array<Record<string, unknown>> = [
      seo.websiteSchema(),
      seo.organizationSchema(),
      seo.softwareApplicationSchema({
        url: `${ORIGIN}/product`,
        pricingUrl: `${ORIGIN}/pricing`,
      }),
      seo.faqPageSchema([{ q: "q", a: "a" }]),
      seo.productOfferSchema({
        name: "x",
        description: "y",
        url: "z",
        priceMonthlyUsd: 1,
      }),
      seo.breadcrumbSchema([{ name: "Home", url: "/" }]),
      seo.howToSchema({
        name: "x",
        description: "y",
        url: `${ORIGIN}/g`,
        steps: [{ name: "s", text: "t" }],
      }),
      seo.articleSchema({
        url: `${ORIGIN}/blog/x`,
        headline: "H",
        description: "D",
        datePublished: "2026-05-01",
        author: { name: "A" },
      }),
    ];
    for (const sample of samples) {
      const json = JSON.stringify(sample);
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed["@context"]).toBe("https://schema.org");
      expect(typeof parsed["@type"]).toBe("string");
    }
  });
});
