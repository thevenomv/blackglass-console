# Stripe live cutover (BLACKGLASS)

Use this **after** test-mode validation. Keep keys in Doppler / DO secrets — never commit.

## 1. Prerequisites

- [ ] Live **Stripe** account with **restricted API key** (not full-secret in app servers).
- [ ] **Webhook endpoint**: `https://<your-domain>/api/checkout/webhook` (exact URL Stripe will call).
- [ ] **`STRIPE_PRO_PRICE_ID`** for the recurring SKU you sell (`npm run stripe:setup` creates test objects; recreate for live).

## 2. Secrets (mirror in production env)

See **`.env.example`** — minimally:

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server API (restricted live key) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from **Developers → Webhooks → endpoint** |
| `STRIPE_PRO_PRICE_ID` | Price ID wired into checkout handler |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-side Stripe.js |

Restart/redeploy after changing **`NEXT_PUBLIC_*`**.

## 3. Smoke tests

1. **Dashboard:** Stripe webhook deliver → **`plan.changed`** in audit/API and plan limits update (Spaces-backed cache if configured).
2. **Checkout:** `/pricing` → complete **live-mode** checkout with a real/test card Stripe allows → confirm subscription in Stripe dashboard.
3. **CLI verification (optional):** `stripe listen --forward-to localhost:3000/api/checkout/webhook` in dev only; prod uses Stripe dashboard **Events** tab.

## International / presentment

Stripe Checkout and invoices follow the **currency and tax settings** on your Stripe account and the customer’s country. This console does not hard-code a display currency — keep **Prices** and **Tax** behavior in Stripe aligned with your go-to-market regions before enabling live mode.

## 4. Rollback

- Pause webhook in Stripe or rotate **`STRIPE_WEBHOOK_SECRET`**.
- Set **`BLACKGLASS_PLAN`** / env fallback policy per **`src/lib/server/plan-store.ts`** and operator playbook.
