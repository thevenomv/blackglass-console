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

1. **Dashboard:** Stripe webhook delivered → `saas_subscriptions` row updated for the tenant (verify with `psql $DATABASE_URL -c "select status, plan from saas_subscriptions where tenant_id=…"`); `plan.changed` audit event emitted.
2. **Checkout:** `/pricing` → complete **live-mode** checkout with a real/test card Stripe allows → confirm subscription in the Stripe dashboard.
3. **CLI verification (optional):** `stripe listen --forward-to localhost:3000/api/checkout/webhook` in dev only; prod uses the Stripe dashboard **Events** tab.

## International / presentment

Stripe Checkout and invoices follow the **currency and tax settings** on your Stripe account and the customer's country. This console does not hard-code a display currency — keep **Prices** and **Tax** behaviour in Stripe aligned with your go-to-market regions before enabling live mode.

## 4. Rollback

- Pause the webhook in Stripe or rotate `STRIPE_WEBHOOK_SECRET`.
- For SaaS deployments, plan state lives in `saas_subscriptions` (Postgres) and is reconciled daily by `npm run reconcile:billing`. Rolling back a single tenant is a Stripe-side action (cancel / refund) plus `reconcile:billing` to converge.
- For single-tenant / legacy deployments, set the `BLACKGLASS_PLAN` env fallback per `src/lib/server/plan-store.ts` and the operator playbook.
