# Changelog

All notable user-facing and integration-facing changes are summarized here. Internal refactors and comment-only edits are omitted unless they affect operators or integrators.

## Unreleased

### Repository layout refactor (2026-05-16 — autonomous batch)

A multi-pass cleanup of the repo's top-level shape. **No runtime behaviour
changed** — this is internal layering and verify-pipeline ergonomics. The
moves below are listed in case anyone is rebasing a long-lived branch.

#### tsconfig + verify scripts

- TypeScript `target` bumped `ES2017` → `ES2022`; `noFallthroughCasesInSwitch`
  and `noImplicitReturns` enabled (one real bug fixed in
  `src/components/onboarding/OnboardingFlow.tsx`).
- `verify:stage0` split into `verify:fast` (lint + typecheck + unit),
  `verify:contract` (RLS-bypass + OpenAPI + schemas-export + migrations) and
  `verify:build`. The old `verify:stage0` still exists and runs all three in
  order; CI is unchanged.

#### ESLint architectural boundaries

- `no-restricted-imports` for `src/app/api/**` to block direct imports of
  `@/lib/auth/legacy-permissions` — route handlers must go through
  `@/lib/server/http/saas-access`. `/api/session` is the documented exception.

#### Renames (import sites updated)

| Before | After |
|---|---|
| `src/lib/auth/permissions.ts` | `src/lib/auth/legacy-permissions.ts` |
| `src/lib/remediation-snippets.ts` | `src/lib/client/remediation-snippets.ts` |
| `src/lib/onboarding/troubleshooting.ts` | `src/lib/client/onboarding-troubleshooting.ts` |
| `src/lib/billing/provision.ts` | `src/lib/server/billing/provision.ts` |
| `src/lib/server/audit-append-pg.ts` | `src/lib/server/store/legacy/audit-append-pg.ts` |
| `src/lib/server/store/baseline-pg.ts` | `src/lib/server/store/legacy/baseline-pg.ts` |
| `src/lib/server/store/driftevents-pg.ts` | `src/lib/server/store/legacy/driftevents-pg.ts` |
| `src/lib/server/store/drifthistory-pg.ts` | `src/lib/server/store/legacy/drifthistory-pg.ts` |
| `src/lib/server/remediation-snippets.ts` | **deleted** (dead code; client mirror is canonical) |
| `scripts/_scratch/_send-test-emails.ts` | `scripts/email/_send-test-emails.ts` |

#### Folder restructure (no behaviour change)

- **`src/db/schema.ts`** (742 lines, 36 KB) → `src/db/schema/{saas,credentials,hosts,sandboxes,evidence,drift,notifications,kms,retention,scan-usage,janitor,index}.ts`. The barrel re-exports everything; `import { … } from "@/db/schema"` still works.
- **`src/lib/server/drift-engine.ts`** and **`src/lib/server/outbound-webhook.ts`** converted to folder modules with `REFACTOR.md` plans for incremental carve-up.
- **`tests/unit/`** — 80 flat files → 20 domain subfolders.
- **`scripts/`** — 51 flat scripts → 16 domain subfolders.
- **`docs/`** — 33 flat docs → 5 domain subfolders (`architecture/`, `security/`, `operations/`, `saas/`, `marketing/`). `docs/README.md` is now a navigation index.
- **`docs/migrations/`** → **`docs/sql/`** (numeric prefixes dropped; `docs/sql/README.md` explains the out-of-band SQL scripts).

#### Governance / docs added

- `.github/CODEOWNERS` — `@thevenomv` owns everything; hot-path entries call out auth, db schema, OpenAPI, deploy/Helm/Terraform, and the verify pipeline.
- `docs/architecture/adr/0001-repo-layering-conventions.md` — records the layering rules so future moves stay consistent.

#### Static asset optimisation

- **OG images re-encoded** — `public/og-default.png` (1.6 MB → 262 KB, -83%),
  `public/og-tools.png` (1.6 MB → 254 KB, -84%), `public/brand/logo-email.png`
  (878 KB → 26 KB, -97%). Total static-asset payload down ~3.5 MB. Filenames
  unchanged so cached LinkedIn / Slack / Facebook previews don't re-fetch.
- **WebP siblings emitted** at `public/og-default.webp`, `public/og-tools.webp`,
  `public/brand/logo-email.webp` (28 KB / 27 KB / 7 KB) for crawlers that
  accept `image/webp` — no metadata wiring yet, ship-ready for a follow-up.
- **`npm run build:optimize-og`** — idempotent re-encoder (sharp, transitive
  through `next`). Re-run whenever the source PNGs change.

#### Drift engine + outbound webhook carve-up

- **`src/lib/server/drift-engine/`** split into `index.ts` (public re-export),
  `compute.ts` (the diff function), `store.ts` (sync in-memory + JSON file
  persistence), `store-async.ts` (Postgres-backed reads with cross-process
  freshness), `helpers.ts` (`id()` / `now()` leaf utilities). `REFACTOR.md`
  notes the remaining per-category split for `compute.ts`.
- **`src/lib/server/outbound-webhook/`** split into `index.ts` (public API
  only), `types.ts`, `signing.ts`, `config.ts`, `dispatch.ts`, and
  `platforms/{detect,format,slack,pagerduty,servicenow,jira,datadog,linear,github,splunk,asff,sentinel,ocsf}.ts`.
  Public exports unchanged (`dispatchDriftWebhook`, `dispatchTenantJsonWebhooks`,
  `sendTestWebhook`, `deliverWebhookInline`, `webhookUrls`, `__internals`).

#### Strict TypeScript + lint

- **`tsconfig.noUncheckedIndexedAccess: true`** — all 170+ resulting errors
  fixed (non-null assertions where flow guarantees the value, optional chaining
  where it doesn't, explicit checks on Drizzle `insert().returning()` results).
- **`@typescript-eslint/eslint-plugin`** added (warn on `no-explicit-any` and
  `no-unused-vars`).
- **`eslint-plugin-import`** added (`no-self-import`, `no-empty-named-blocks`,
  `no-duplicates` all error-level).
- Duplicate-import warnings cleaned up across 5 files.

#### Other layout polish

- **`src/components/dashboard/`** consolidated into the dashboard route's
  `_components/` folder (`DriftTrendChart`, `SystemStatusBanner`,
  `ValueRecapBanner`). Frees the top-level `components/` of route-local UI.
- **`src/lib/saas/auth-context.ts` → `tenant-context.ts`** — same file, clearer
  name. 17 import sites updated. All exports unchanged.
- **`src/worker/`** — flat `scan-worker.ts` / `ops-worker.ts` /
  `sandbox-worker.ts` re-shaped into `src/worker/{scan,ops,sandbox}/index.ts`.
  `package.json` / `Dockerfile.worker` / `scripts/build/build-worker.mjs`
  updated to match.
- **`tests/unit/**/*.test.ts`** — all relative imports
  (`../../../src/lib/...`) migrated to the `@/` alias (13 files).
- **`openapi/README.md`** added — documents the single-file `blackglass.yaml`
  layout and the planned ref-based split (deferred; needs verify-pipeline
  rewrite).

### Marketing SEO follow-up (2026-05-11 — autonomous batch)

- **`articleSchema()`** in `src/lib/seo.ts` + **Article JSON-LD** on all blog posts (including new posts).
- **`/llms.txt`** route — AI/LLM crawler entry point with curated internal links (`src/app/llms.txt/route.ts`).
- **`robots.txt`** — explicit `allow` for `/` and `/api/og` (OG image fetchers), `disallow` for `/pricing/success`, `host` hint when origin is configured.
- **Root layout** — `alternates.types` RSS discovery for `/changelog/feed.xml`.
- **Nav + footer** — primary nav adds Compare + Blog; footer adds Compare column (incl. Tenable/Qualys), new use-case links, Glossary, RSS.
- **`/glossary`** — 12 anchored terms from `src/lib/glossary.ts`.
- **`/vs/tenable`** and **`/vs/qualys`** comparison pages; **`VsLayout`** optional related-comparison links; all five `/vs/*` pages cross-link.
- **Three new blog posts** — snapshot freshness, RLS tenant isolation, Charon cleanup safety model.
- **`/pricing` FAQ** expanded to 23 Q&As (visible + FAQPage JSON-LD); **`/product`** and **`/security`** each gain a visible FAQ + matching FAQPage JSON-LD.
- **Sitemap + middleware** — new routes whitelisted for public access.
- **Tests** — `articleSchema` coverage in `seo-helpers.test.ts`.

### SEO infrastructure (2026-05-11 — bucket A + B)

Mechanical follow-on to the P0 / P1 audit shipped a day earlier; locks the
SEO surface against future regressions and adds the missing per-route
freshness signals.

#### Bucket A — site surface

- **BreadcrumbList JSON-LD** on the remaining 10 marketing pages — every public route now emits a Home → Section → Leaf trail. Verifiable via Rich Results Test.
- **`alternates.canonical`** on legal + flow pages that previously inherited only the layout default — `/privacy`, `/terms`, `/dpa`, `/subprocessors`, `/demo`, `/book`, `/pricing/success`, `/recover`. Closes the duplicate-URL signal-dilution gap.
- **`/pricing/success`** now `robots: { index: false, follow: false, nocache: true }` — the URL carries a per-checkout `session_id` and must never reach SERPs.
- **`/sign-in/[[...sign-in]]` and `/sign-up/[[...sign-up]]`** marked `noindex` — auth surfaces have no SEO value and create duplicate-content risk against `/recover`.
- **Sitemap `lastmod` from real git history** (`git log -1 --format=%cI -- <file>`) instead of `new Date()` per route. Per-page freshness signals stop collapsing into a single build-timestamp on every URL. File mtime fallback for ephemeral build environments.
- **Per-route dynamic Open Graph images** via `next/og` `ImageResponse` — single edge endpoint at `/api/og?title=…&subtitle=…` renders a branded card per page. Wired on home, `/pricing`, `/product`, the how-to guide; static `/og-default.png` remains the fallback for legal + redirect pages. CDN cache key is the URL, so title changes invalidate naturally.
- **`/changelog/feed.xml`** — RSS 2.0 feed sourced from the same `src/lib/changelog.ts` module the page renders from (no drift). `force-static` + `revalidate=3600`. Surfaced on `/changelog` as a `<link rel="alternate" type="application/rss+xml">` and a visible Subscribe via RSS link.
- **Custom `not-found.tsx`** — replaces the two-link placeholder with a 5-section navigation hub (18 internal links). `robots: { index: false, follow: true }` so accidental 404s don't pollute the index but Google can re-discover canonical URLs from broken inbound links.

#### Bucket B — engineering quality

- **Unit tests for `src/lib/seo.ts`** (`tests/unit/seo-helpers.test.ts`, +23 tests) — locks every schema factory's required fields, canonical edge cases (trailing slash, missing env, leading slash, query strings), `dynamicOgImages` URL encoding, JSON-serialisability of every emitter.
- **Marketing-page smoke test** (`tests/unit/marketing-page-seo.test.ts`, +113 tests) — discovers every `page.tsx` under `src/app/(marketing)`, asserts each one declares `alternates.canonical`, declares an OG image when it overrides `openGraph`, renders an `<h1>`, and never hand-rolls a raw `<script type="application/ld+json">` (must use `<JsonLd />`). Documented per-route exceptions for `/pricing/success` (noindex), `/passphrase-recovery` (redirect), `/sign-in/*` and `/sign-up/*` (auth surfaces), `/demo/*` subpages (shared workspace), and `/` (h1 lives in `<LandingPage />`).
- **`docs/marketing/seo.md`** — engineering-side strategy doc covering schema choices, the `<JsonLd />` wrapper rationale, why we use a centralised `/api/og` endpoint instead of per-route `opengraph-image.tsx`, the validation workflow, and the full file map.
- **Heading hierarchy fixes** — `/tools` and the 3 tool subpages had no `<h1>` (used `<h2>` for the page title); upgraded to `<h1>` so heading hierarchy is well-formed and the smoke test passes without exception.
- **`src/lib/changelog.ts`** — extracted the `ENTRIES` array from the `/changelog` page component into a shared module so the page and the RSS feed never drift. Same call sites; `formatChangelogDate()` keeps the page rendering "10 May 2026" while the feed emits stable noon-UTC RFC 822 timestamps.

#### Build / test signal

- TypeScript clean (`npx tsc --noEmit`, 0 errors).
- Vitest: 76 files, 701 passed, 4 skipped, 1 pre-existing skipped (no test added by this change).
- No new dependencies; `next/og` ships with Next.js.
- Edge runtime declared on `/api/og` as required by `ImageResponse`.

### Pricing (2026-05-10 calibration)

- **New Team tier** at **$89/mo** (25 hosts · 3 operator seats · hourly scans · full API · 90 days drift / 180 days audit) sits between Starter and Growth, closing the previous 5× pricing cliff ($39 → $199) that left SMB buyers in the 15–50 host band with no landing pad.
- **Starter raised to $59/mo · 15 hosts · 3 seats** (was $39 / 10 / 2). Per-host overage stays at $4. The previous Starter inclusions made it too thin to justify the upgrade from Lab; raising the inclusion ceiling and price together restores the upgrade-urgency story without trimming the free tier.
- **Lab unchanged but the Charon wedge is now explicit** — Lab keeps its 1 free linked Charon cloud account (read-only inventory) so the public `/tools` cloud-waste estimator can convert into the real product without an immediate paywall. Live cleanup is still gated by the paid Charon add-on. This is a marketing-surface change only — the entitlement was already in `COMMERCIAL_PLANS.lab.charonLinkedAccountsMax`.
- **Enterprise anchor raised from $1,500 to $2,500/mo** (`ENTERPRISE_PRICE_ANCHOR_CENTS_MONTHLY = 250_000`). The previous floor couldn't fund the named-CSM and SLA promises that ship with the tier — the new anchor pre-qualifies procurement-savvy buyers without underpricing the implied work.
- **Remediator add-on included quota raised from 100 to 250 actions/month** (price unchanged at $99/mo, overage unchanged at $0.10/action). A real Growth customer running weekly drift on a 10-host fleet was blowing through 100 included actions in week 1 and immediately seeing metered overage; 250 covers a comfortable working window before the meter starts.
- **Stripe SKUs to create before launch:** `STRIPE_TEAM_PRICE_ID` + `STRIPE_TEAM_ANNUAL_PRICE_ID` (new), `STRIPE_STARTER_PRICE_ID` + `STRIPE_STARTER_ANNUAL_PRICE_ID` (re-create at the new $59/$590 price points; the old IDs still resolve to "starter" via the env-var slot but the amount will be wrong). Until set, the inline `price_data` fallback in `POST /api/checkout` uses the new amounts directly so checkout works end-to-end.
- **`scripts/stripe-setup.mjs` rewritten as an idempotent multi-tier provisioner** — covers all 5 paid tiers + the Remediator and Charon add-ons in one pass. Products are matched by `metadata.plan` and prices by `lookup_key` (e.g. `team_monthly`, `remediator_annual`), so re-running is safe and reports each SKU as `existing` instead of duplicating it. Refuses to write against a `sk_live_*` key without the explicit `--i-mean-live` flag; supports `--dry-run`. Test-mode SKUs created against the `dev` Doppler config on 2026-05-10; live-mode SKUs are pending operator action against `prd` (run `doppler run --config prd -- node scripts/stripe-setup.mjs --i-mean-live` once the rotated live key is in place).
- **Tests added** in `tests/unit/plans-structure.test.ts` (33 → 38): Team-tier presence, monotonic capacity check across 6-tier paid ladder, headline-price pin (Starter $59 / Team $89 / Growth $199), Lab-keeps-1-Charon-account invariant, Enterprise anchor pinned to exactly $2,500, Remediator quota pinned to exactly 250.
- **Marketing FAQ** gained a "why a Team tier?" entry; metadata description and host-quota / scan-frequency / retention answers updated to reflect the 7-tier ladder.
- **Out of scope for this change** (in the strategic-refresh canvas at `canvases/project-overview.canvas.tsx` §0 for follow-up): customer-logo addition (gated on first paying customer), `/compare/{wazuh,datadog,vanta}` competitive pages, Business-tier differentiation (SOC 2 evidence pipeline scoping), per-tenant scan-cost telemetry, `/status` page verification.

### Marketing site

- **New `/tools` area** — public, no-signup, pre-scan planning tools aligned with Blackglass and Charon. Three browser-only tools ship live:
  - **Cloud Waste Estimator** (`/tools/cloud-waste-estimator`) — monthly-waste range across DigitalOcean, AWS, and GCP from rough self-reported counts (idle compute, orphaned volumes, old snapshots). Includes a downloadable cleanup checklist and an optional **POST `/api/tools/cloud-waste-report`** endpoint that emails the summary (rate-limited 5/IP/10 min, audit-logged as `tools.cloud_waste.report_requested`, optional Slack ping via `SLACK_TOOLS_LEAD_WEBHOOK_URL`).
  - **Linux Drift Risk Score** (`/tools/linux-drift-risk`) — five-question questionnaire that scores change-control posture and surfaces the three drift classes most worth watching for that fleet shape. Multiple-choice only; no free text, no telemetry.
  - **Cloud Inventory Diff Visualiser** (`/tools/cloud-inventory-diff`) — drag-drop two JSON inventory exports (the same shape Charon emits) to see a categorised structural diff (added/removed/changed) with field-level highlights. Files are parsed in-browser via the FileReader API and discarded; nothing is uploaded.
- All three tools fire `dataLayer` events (`tool_estimator_opened`, `tool_estimator_recomputed`, `tool_checklist_downloaded`, `tool_email_submitted`, `tool_demo_cta_clicked`, `tool_charon_cta_clicked`, `tool_pricing_cta_clicked`) and add `?source=tools-<slug>-<surface>` to every `/demo` link for funnel attribution.
- **Plausible Analytics** (cookie-free, no consent banner required) wired on public marketing routes only — never inside the authenticated `(app)` console. Loaded by `src/components/marketing/PlausibleScript.tsx`, gated on `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`. Self-hosted instances can override the script URL via `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL`. The `trackToolEvent` shim now fans every event out to both Plausible (`window.plausible(name, { props })`) and `window.dataLayer` so future providers slot in without touching component code.

### Bug fixes

- **PublicFooter hydration warning** — `new Date().getFullYear()` is now hoisted to module scope so SSR and client hydration always agree. Eliminates the React hydration warning that surfaced on every marketing page in dev tools.

### Security hardening (free tools surface)

- **Per-recipient rate limit on `/api/tools/cloud-waste-report`** — 1 submission per email address per 24h, keyed on `sha256(normalize(email))` so the rate-limit bucket holds an opaque digest, never plaintext PII. Defends against the IP-rotation mail-bomb path the per-IP guard alone couldn't cover (5/IP × N residential IPs = mailbombable). On a hit the route returns **200 OK** (not 429) so an attacker can't probe whether a victim address has been mailed recently.
- **Slack fan-out switched to Block Kit `plain_text` blocks** — eliminates the mrkdwn injection vector where a malicious `org` value of `<!channel> :rocket:` would have pinged the whole sales channel. Top-level `text` fallback is now a static, user-input-free string.
- **CSP allowlists Plausible** on both `script-src` and `connect-src` (default `https://plausible.io` plus the host parsed from `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` when self-hosting). Without this, flipping `SECURITY_HEADERS_CSP_ENFORCE=true` would silently break analytics on launch day.
- **Inventory diff client caps uploads at 10 MB** with a friendly per-file error state. UX guardrail (FileReader runs locally; nothing to defend server-side) but stops 500 MB JSON files from locking up a tab before the parser surfaces the issue.
- **GDPR Art. 5(e) retention obligation documented** in `docs/architecture/audit-trail.md` → "PII in process-global audit rows", covering both `marketing.contact_sales_lead` and `tools.cloud_waste.report_requested`. Retention matrix per sink + right-to-erasure lookup pattern. Cross-referenced from the API route docstring.
- **Audit-log injection neutralised** — new `formatAuditDetail()` helper in `src/lib/server/audit-log.ts` JSON-escapes every value going into the `detail` string. Previously, a hostile `org` of `Acme" injected="malicious` would have escaped the `key="value"` grammar and tricked downstream log parsers; embedded newlines or ANSI escape codes (`\x1b[31m`) could have corrupted operator terminals viewing the file directly. Applied to both `POST /api/tools/cloud-waste-report` (new in this release) **and** to the pre-existing `POST /api/contact-sales` route, which had the identical vulnerability.
- **`/api/contact-sales` Slack fan-out hardened** — same Block Kit `plain_text` fix applied to the older sibling endpoint, closing an `<!channel>`-injection path via the lead `name` / `company` / `message` fields. Top-level `text` fallback is now a static notification string.
- **Deployment trust boundary documented** — `clientIp()` and `docs/security/http-rate-limit-budgets.md` now spell out the requirement that the edge proxy MUST strip and replace any client-supplied `x-real-ip` and `x-forwarded-for` headers. Without that stripping (DO App Platform default; nginx requires explicit `proxy_set_header` directives), an attacker can rotate `x-real-ip` per request and bypass every per-IP rate limit. Includes a one-line `curl` smoke check operators can run post-deploy.

### Integrations (breaking for strict parsers)

- **CEF (Microsoft Sentinel / generic CEF relays):** Vendor and product fields in the CEF prefix are now `Blackglass` (previously `BLACKGLASS`). Signature IDs use the prefix `Blackglass-` (e.g. `Blackglass-PRIVILEGE_ESCALATION` instead of `BLACKGLASS-PRIVILEGE_ESCALATION`). Update SIEM correlation rules or allowlists that matched the old literal strings.
- **OCSF / Security Lake:** `metadata.product.name` is now `Blackglass` (previously `BLACKGLASS`).
- **Slack / Teams / generic markdown bodies:** Phrases such as “Review in BLACKGLASS” are now “Review in Blackglass”. Webhook `User-Agent` is `Blackglass-Webhook/1.0`.

### Public API

- **GET `/api/public/demo-report`:** Default response is a sample integrity report PDF. **`?format=json`** returns the JSON payload used to render that PDF (for tooling and demos).

### Branding (no API contract change)

- User-visible product name is **Blackglass** (title case) across the console, marketing pages, PDFs, and transactional emails. Environment variable names such as `BLACKGLASS_PLAN`, `BLACKGLASS_KEY`, and `BLACKGLASS_AIRGAPPED` are unchanged.
