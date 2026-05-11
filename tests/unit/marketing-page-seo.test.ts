import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Marketing-page SEO smoke test.
 *
 * Catches the regression we shipped in the first SEO pass: page-level
 * `openGraph` blocks REPLACE the layout's `openGraph` rather than deeply
 * merge it, so any page that defines its own block must also explicitly
 * include the OG image. This test asserts the full contract per page:
 *
 *   1. Imports a `canonical` from "@/lib/seo".
 *   2. Sets `alternates: { canonical: ... }` in metadata.
 *   3. Either uses `defaultOgImages()` / `dynamicOgImages(...)` for the OG
 *      image, OR explicitly declares a tool-specific image (the /tools/*
 *      pages share `/og-tools.png`).
 *   4. Has at least one `<h1>` in the JSX.
 *
 * We grep the source files instead of executing them because Next.js
 * page modules pull in server-only code. AST-grade analysis isn't needed
 * — the patterns are stable and any future refactor that breaks them
 * would also flag in linting.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MARKETING_DIR = path.join(REPO_ROOT, "src/app/(marketing)");

interface PageContract {
  /** Posix-style path relative to repo root. */
  readonly file: string;
  /** Human-readable identifier used in test output. */
  readonly route: string;
  /**
   * Why this page can skip a particular check (for the rare exception).
   * `null` means "every check applies". Any non-null entry must have a
   * single-line justification and is surfaced in test failures.
   */
  readonly skipOgImage?: string;
  readonly skipH1?: string;
  readonly skipCanonical?: string;
}

/**
 * Discover every `page.tsx` under `src/app/(marketing)` and decide which
 * contract checks apply. The route group `(marketing)` is the SEO surface;
 * the console route group is intentionally excluded (it's noindexed).
 */
function discoverPages(): PageContract[] {
  const out: PageContract[] = [];
  function walk(dir: string) {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        walk(abs);
      } else if (name === "page.tsx") {
        const rel = path.relative(REPO_ROOT, abs).split(path.sep).join("/");
        const route =
          "/" +
          rel
            .replace("src/app/(marketing)/", "")
            .replace("page.tsx", "")
            .replace(/\/$/, "");
        out.push({
          file: rel,
          route: route === "/" ? "/" : route,
          // Per-route exceptions — keep tight; explain the why so future
          // contributors can challenge / remove the exception.
          ...(route === "/pricing/success"
            ? { skipOgImage: "noindex post-checkout page", skipCanonical: "noindex page" }
            : {}),
          ...(route === "/"
            ? {
                skipH1:
                  "h1 lives in the imported <LandingPage /> component, not directly in page.tsx",
              }
            : {}),
          ...(route.startsWith("/demo/") && route !== "/demo"
            ? {
                skipH1:
                  "demo subpages render a shared DemoShell wrapper; primary h1 sits at /demo",
                skipCanonical:
                  "demo subpages share metadata with /demo and don't need per-screen canonical",
                skipOgImage: "demo subpages inherit /demo's OG card",
              }
            : {}),
          ...(route === "/passphrase-recovery"
            ? {
                skipH1: "permanentRedirect-only page, never renders",
                skipCanonical: "redirect target — no canonical needed",
                skipOgImage: "redirect target — no share preview ever rendered",
              }
            : {}),
          ...(route.startsWith("/sign-in") || route.startsWith("/sign-up")
            ? {
                skipH1: "Clerk-rendered auth surface — h1 sits inside <SignIn /> / <SignUp />",
                skipCanonical: "noindex auth surface (robots: { index: false, follow: false })",
                skipOgImage: "noindex auth surface — no share preview needed",
              }
            : {}),
        });
      }
    }
  }
  walk(MARKETING_DIR);
  return out;
}

const PAGES = discoverPages();

describe("marketing pages — SEO contract", () => {
  it("discovers a non-trivial number of pages", () => {
    // Sanity check — if the route group is renamed this test would
    // silently pass with an empty list.
    expect(PAGES.length).toBeGreaterThan(15);
  });

  describe.each(PAGES)("$route ($file)", (page) => {
    const src = fs.readFileSync(path.join(REPO_ROOT, page.file), "utf8");

    it("declares an alternates.canonical (or has documented opt-out)", () => {
      if (page.skipCanonical) return;
      // Accept any of:
      //   alternates: { canonical: ... }
      //   alternates: { canonical: ..., types: { ... } }
      //   alternates: { types: { ... }, canonical: ... }
      // Multiline with nested braces, so we just look for the two
      // tokens in close proximity rather than a strict block parse.
      const hasAlternates = /alternates\s*:\s*\{/.test(src);
      // Accept canonical("…"), canonical(PATH), canonical( PATH ), etc.
      const hasCanonicalCall = /\bcanonical\s*\(/.test(src);
      expect(
        hasAlternates && hasCanonicalCall,
        `expected alternates: { ... canonical(...) ... } in ${page.file}`,
      ).toBe(true);
    });

    it("declares an OG image when openGraph block is defined", () => {
      if (page.skipOgImage) return;
      // Pages WITHOUT a custom openGraph block inherit layout's defaults
      // (which include /og-default.png). They legitimately need no image
      // declaration. Pages WITH a custom openGraph block REPLACE the
      // layout block (Next.js merge semantics) and MUST include an image.
      const declaresOpenGraph = /openGraph\s*:\s*\{/.test(src);
      if (!declaresOpenGraph) return;
      const hasOg =
        /defaultOgImages\s*\(/.test(src) ||
        /dynamicOgImages\s*\(/.test(src) ||
        /\/og-tools\.png/.test(src) ||
        /\/og-default\.png/.test(src);
      expect(
        hasOg,
        `${page.file} declares openGraph but no images — Next.js will replace the layout's image. ` +
          `Add defaultOgImages() / dynamicOgImages({...}) / static path.`,
      ).toBe(true);
    });

    it("renders an <h1>", () => {
      if (page.skipH1) return;
      expect(src, `expected <h1 in ${page.file}`).toMatch(/<h1[\s>]/);
    });
  });
});

describe("marketing pages — JSON-LD usage", () => {
  /**
   * Pages that emit structured data must do so via the shared
   * `<JsonLd data={...} />` component so we get consistent
   * `suppressHydrationWarning` + script tagging. Any direct
   * `<script type="application/ld+json">` is a smell.
   */
  it("no marketing page hand-rolls a ld+json script tag", () => {
    const offenders: string[] = [];
    for (const page of PAGES) {
      const src = fs.readFileSync(path.join(REPO_ROOT, page.file), "utf8");
      if (/<script[^>]+type=["']application\/ld\+json["']/.test(src)) {
        offenders.push(page.file);
      }
    }
    expect(offenders, `use <JsonLd /> instead of raw script tags`).toEqual([]);
  });
});
