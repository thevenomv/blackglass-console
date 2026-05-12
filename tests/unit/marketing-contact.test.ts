import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("marketing contact", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults marketing and security inboxes", async () => {
    const { getMarketingContactEmail, getSecurityContactEmail } = await import("@/lib/marketing/contact");
    expect(getMarketingContactEmail()).toBe("hello@blackglasssec.com");
    expect(getSecurityContactEmail()).toBe("security@blackglasssec.com");
  });

  it("accepts NEXT_PUBLIC overrides when valid", async () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_CONTACT_EMAIL", "Sales@Example.COM");
    vi.stubEnv("NEXT_PUBLIC_SECURITY_CONTACT_EMAIL", "Sec@Example.com");
    const { getMarketingContactEmail, getSecurityContactEmail } = await import("@/lib/marketing/contact");
    expect(getMarketingContactEmail()).toBe("sales@example.com");
    expect(getSecurityContactEmail()).toBe("sec@example.com");
  });

  it("rejects invalid override and falls back", async () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_CONTACT_EMAIL", "not-an-email");
    const { getMarketingContactEmail } = await import("@/lib/marketing/contact");
    expect(getMarketingContactEmail()).toBe("hello@blackglasssec.com");
  });

  it("builds mailto with encoded subject", async () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_CONTACT_EMAIL", "sales@example.com");
    const { marketingMailtoHref } = await import("@/lib/marketing/contact");
    const href = marketingMailtoHref("Hello — Blackglass");
    expect(href).toMatch(/^mailto:sales@example\.com\?subject=/);
    expect(href).toContain(encodeURIComponent("Hello — Blackglass"));
  });
});

describe("plex font subsets", () => {
  it("includes latin-ext for European diacritics", async () => {
    const { PLEX_GOOGLE_SUBSETS } = await import("@/lib/fonts/plex");
    expect(PLEX_GOOGLE_SUBSETS).toContain("latin");
    expect(PLEX_GOOGLE_SUBSETS).toContain("latin-ext");
  });
});
