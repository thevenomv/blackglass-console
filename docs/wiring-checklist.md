# Revenue & identity wiring checklist (**internal**)

Use this before a billing or go-to-market push. Automated coverage: `tests/e2e/wiring-revenue-identity.spec.ts` plus existing smoke. Default Playwright runs **clear** Clerk and Stripe env vars unless `PLAYWRIGHT_CLERK=1` / `PLAYWRIGHT_FULL_COMMERCE=1` (see `playwright.config.ts`).

## Stripe — browser checkout

| Step | Route / action | Expected |
|------|----------------|----------|
| 1 | `GET /pricing` | 200; plans render; checkout buttons visible |
| 2 | `POST /api/checkout` body `{ "planCode": "starter" \| "growth" \| "business" }` | With `STRIPE_SECRET_KEY`: 200 JSON `{ url }` to Stripe Checkout. Without key: **503** `billing_unavailable` |
| 3 | Stripe-hosted session | `success_url` = `{origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}` |
| 4 | Stripe-hosted cancel | `cancel_url` = `{origin}/pricing` |
| 5 | `GET /pricing/success` | 200; confirm copy; links to `/dashboard`, `/hosts` |

**Manual (test mode):** use Stripe test card, complete checkout, confirm success page and (if configured) tenant provisioning via webhook.

## Stripe — webhooks

| Item | Detail |
|------|--------|
| Endpoint | `POST /api/checkout/webhook` |
| Env | `STRIPE_WEBHOOK_SECRET` must match Stripe CLI or dashboard signing secret |
| Invalid / replay | Missing `stripe-signature` → **400**; duplicate `event.id` (in-memory idempotency) → 200 `received` |
| Billing dependency | `checkout.session.completed`, `subscription.*`, `invoice.*` handlers update SaaS DB when `tryGetDb()` is true |

Configure webhook URL in Stripe Dashboard to `https://<your-domain>/api/checkout/webhook`.

## Clerk vs legacy login

| Surface | Clerk enabled (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`) | Clerk disabled |
|---------|--------------------------------------------------------------------------|----------------|
| Marketing nav “Sign in” / “Start free trial” | `/sign-in`, `/sign-up` | `/login` |
| Home hero (`LandingPage`, `TrialSignupLink`) | Clerk URLs above | `/login` |
| `GET /sign-in`, `/sign-up` | Clerk UI | **Server redirect → `/login`** (no Provider crash) |
| Middleware | `clerkPublic` includes `/pricing`, `/pricing/success`, `/changelog`, `/api/checkout(.*)`, … | Legacy cookie gate for `AUTH_REQUIRED` |

## Public routes (middleware)

Ensure new marketing pages are listed in **`middleware.ts`** (`clerkPublic` + legacy public list). Example: **`/changelog`**.

## Sitemap / SEO

New public pages belong in **`src/app/sitemap.ts`** `PATHS` (and `PRIORITY` if needed).

## E2E commands

```bash
npm run test:e2e
npx playwright test tests/e2e/wiring-revenue-identity.spec.ts
```

Full Stripe in local Playwright (optional):

```bash
set PLAYWRIGHT_FULL_COMMERCE=1
set STRIPE_SECRET_KEY=sk_test_...
npx playwright test tests/e2e/wiring-revenue-identity.spec.ts
```

See also: **`docs/release-checklist.md`**, **`docs/best-recommendations.md`**.
