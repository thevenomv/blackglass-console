# SEO strategy & conventions

How Blackglass implements on-page SEO: structured data, canonical URLs,
share previews, sitemap freshness, and the regression tests that keep it
working. Read this before adding a new marketing page.

This is an **engineering** doc — keyword strategy, content briefs, and
backlink outreach live in the marketing canvas (e.g. `canvases/seo-follow-up.canvas.tsx` when present).

---

## TL;DR for a new marketing page

1. Put your page under `src/app/(marketing)/<route>/page.tsx`.
2. Import `canonical`, an OG image helper, and a JSON-LD helper from `@/lib/seo`.
3. Set `metadata.alternates.canonical = canonical("/<route>")`.
4. If you declare an `openGraph` block, include `images: defaultOgImages()`
   or `dynamicOgImages({ title, subtitle })`. **Page-level openGraph
   replaces the layout block — it does not deep-merge.**
5. Render an `<h1>` somewhere in the page.
6. Add the route to `src/app/sitemap.ts`. If it introduces a **new**
   top-level segment (e.g. `/glossary`, `/blog`, `/vs`), add the same
   path to `middleware.ts` public matchers (`clerkPublic` and
   `legacyMiddleware` when `AUTH_REQUIRED=true`) — otherwise auth
   middleware will 404 the page in production.
7. Add a `<JsonLd data={breadcrumbSchema([...])} />` near the top of
   `<main>` (Home → Section → Leaf).
8. **Blog posts:** also emit `<JsonLd data={articleSchema({...})} />`
   (author, publisher, dates) for Article-eligible structured data.
9. Run `npx vitest run tests/unit/marketing-page-seo.test.ts` to confirm
   the contract holds.

That's it. The smoke test catches the rest.

---

## Architectural decisions

### Why centralise everything in `src/lib/seo.ts`

Every marketing page that hand-rolled its own metadata block produced
slightly different output:

- Canonical URLs that mixed relative + absolute paths.
- `og:image` URLs that omitted dimensions, breaking Twitter / LinkedIn
  cards.
- `JSON-LD` blocks that drifted from schema.org by a single field name
  (e.g. `applicationCategory` vs `applicationCategorie`).
- Missing `priceValidUntil`, which Google's rich results validator
  silently downgrades from "valid" to "warning".

The `src/lib/seo.ts` helpers are factories — they take the per-page
inputs (title, URL, prices, …) and return validated, typed schema.org
objects. **Add new schema types here, not inline in pages.** The helpers
are unit-tested against schema.org expectations in
`tests/unit/seo-helpers.test.ts`.

### Why `<JsonLd />` instead of raw `<script type="application/ld+json">`

Three reasons:

1. **`suppressHydrationWarning` is set in one place** — without it,
   client / server rendering of the JSON string can produce minor
   ordering differences that React flags as a hydration mismatch.
2. **`dangerouslySetInnerHTML` is sandboxed** — putting it inside a
   wrapper component prevents accidental XSS-via-content (the schema
   factories should never receive untrusted input, but defence in
   depth).
3. **`id` for de-duplication** — pages that emit multiple LD blocks
   (e.g. `/pricing` has Organization + FAQ + Product×6 + Breadcrumb) get
   distinct script `id`s so DOM debugging is sane.

The marketing-page smoke test asserts no page hand-rolls a raw script
tag.

### Why an `/api/og` endpoint instead of per-route `opengraph-image.tsx`

Next.js supports both:

- **Per-route** (`opengraph-image.tsx` colocated with `page.tsx`):
  generates a unique image per route at build time.
- **Centralised endpoint** (`/api/og?title=…&subtitle=…`): one
  `ImageResponse` handler, every page passes its title/subtitle.

We chose centralised because:

- Brand styling lives in one file (`src/app/api/og/route.tsx`); a
  rebrand is one PR, not 30.
- Pages opt in by passing two strings to `dynamicOgImages({ title,
  subtitle })` — no extra file per route.
- The CDN cache key is the URL, so any title change naturally
  invalidates the cache without manual revalidation.

The static `/og-default.png` remains as a fallback for pages that don't
opt into dynamic generation (legal pages, redirect targets).

### Why per-route `lastmod` from `git log` and not `Date.now()`

The default `MetadataRoute.Sitemap` example uses `new Date()` for every
URL on every build. This means:

- Every URL in the sitemap shows the same `<lastmod>`.
- Google's freshness signals collapse — every page looks "updated"
  whenever we deploy, regardless of actual content change.
- A real edit to a single page is invisible; conversely, a typo fix in a
  utility function makes the entire site look stale-then-fresh.

We resolve `<lastmod>` per route via `git log -1 --format=%cI -- <file>`
(file mtime as fallback for ephemeral build environments where `.git`
may be missing). See `src/app/sitemap.ts` → `lastModifiedFor()`.

### Why two heading-hierarchy exceptions in the smoke test

The marketing-page smoke test asserts every page renders an `<h1>`. Two
documented exceptions:

1. **Home page (`/`)** — `page.tsx` is a single-line wrapper that
   renders `<LandingPage />`. The h1 lives inside `LandingPage.tsx`. We
   skip the file-level grep because the smoke test doesn't follow
   imports.
2. **Demo subpages (`/demo/*`)** — these are screens of a shared demo
   workspace, not standalone landing pages. The primary h1 is on
   `/demo` itself, and these pages don't appear in the sitemap.

If you add a third exception, document it in
`tests/unit/marketing-page-seo.test.ts` next to the existing ones.

---

## Schema cheat sheet

Every helper lives in `src/lib/seo.ts` and is unit-tested in
`tests/unit/seo-helpers.test.ts`. Use the closest match for the page
type — Google's rich-results carousels are gated on schema type, so
"good enough" doesn't earn the carousel.

| Page type                 | Helper                          | Renders to                       |
| ------------------------- | ------------------------------- | -------------------------------- |
| Site-wide (root layout)   | `websiteSchema`, `organizationSchema` | Knowledge Graph entity     |
| Product overview          | `softwareApplicationSchema`     | App carousel                     |
| Pricing page              | `productOfferSchema` (×N tiers) + `faqPageSchema` | Pricing rich snippet + FAQ accordion |
| Use-case / category page  | `breadcrumbSchema`              | Breadcrumb URL in SERPs          |
| Step-by-step guide        | `howToSchema` + `breadcrumbSchema` | "Things to know" carousel     |
| Anything with breadcrumbs | `breadcrumbSchema`              | Breadcrumb URL in SERPs          |

For schema types we don't yet emit (`Article`, `BlogPosting`, `Course`,
`Recipe`, `JobPosting`, …), add a new factory function rather than
inlining. The unit tests will fail fast if you forget required fields.

---

## Validation workflow

Before merging a page that emits new structured data:

1. **Local typecheck** — `npx tsc --noEmit`.
2. **SEO unit tests** — `npx vitest run tests/unit/seo-helpers.test.ts`.
3. **Marketing smoke test** — `npx vitest run tests/unit/marketing-page-seo.test.ts`.
4. **Manual schema validation** (after deploy) —
   - https://validator.schema.org/ (raw JSON-LD)
   - https://search.google.com/test/rich-results (rendered page → SERP preview)
5. **OG / Twitter card preview** —
   - LinkedIn Post Inspector
   - Twitter Card Validator (legacy URL still works)
   - Facebook Sharing Debugger (forces re-fetch)

The Rich Results Test on the homepage will only show `Organization`
because the homepage doesn't emit Product / FAQ / HowTo. To verify those
schemas:

- `/pricing` → expect Organization + FAQ + Product (×6) + Breadcrumb
- `/product` → expect Organization + SoftwareApplication + Breadcrumb
- `/guides/how-to-detect-unauthorized-linux-config-changes` → expect Organization + HowTo + Breadcrumb

---

## Things to deliberately NOT do

- **Don't add markup to `(app)` routes.** The console is `noindex` — any
  schema there would just teach Google about authenticated UI it can't
  see.
- **Don't link-check from the marketing site to console routes** in a
  way that exposes them. Internal nav is fine; sitemap entries are not.
- **Don't put pricing tier names in the public changelog.** They look
  in-flux to prospects. Pricing changes belong on `/pricing` and in the
  internal `CHANGELOG.md`.
- **Don't index post-checkout pages** (`/pricing/success`). They carry a
  `session_id` query param — every share would create a duplicate URL
  and leak a checkout reference.
- **Don't index auth surfaces** (`/sign-in/*`, `/sign-up/*`, `/login`).
  No SEO value, duplicate-content risk vs `/recover`.

---

## Where things live

```
src/
  app/
    layout.tsx                 ← global metadata (sitewide OG, Organization JSON-LD)
    sitemap.ts                 ← sitemap.xml generator (lastmod from git)
    robots.ts                  ← robots.txt generator
    not-found.tsx              ← 404 page (noindex, follow=true, internal link hub)
    api/
      og/route.tsx             ← dynamic OG image generator (edge runtime)
    changelog/
      feed.xml/route.ts        ← RSS 2.0 feed (force-static, revalidate=3600)
    (marketing)/               ← every public marketing page
      <route>/page.tsx
  components/
    seo/
      JsonLd.tsx               ← single <script type="ld+json"> wrapper
  lib/
    seo.ts                     ← canonical(), schema factories, OG helpers
    changelog.ts               ← shared source-of-truth for /changelog and /changelog/feed.xml
public/
  og-default.png               ← static fallback share card
  icon.svg                     ← brand icon (referenced by Organization.logo)
tests/
  unit/
    seo-helpers.test.ts        ← unit tests for src/lib/seo.ts
    marketing-page-seo.test.ts ← smoke test asserting every page meets the contract
docs/
  seo.md                       ← this file
canvases/
  seo-follow-up.canvas.tsx     ← marketing-side follow-up tasks (Search Console, etc.)
```
