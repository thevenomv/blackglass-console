#!/usr/bin/env node
/**
 * Recreate Blackglass Stripe products and prices in test mode.
 * Usage: node scripts/stripe-setup.mjs
 * Requires STRIPE_SECRET_KEY env var (or reads from .env.local).
 */

const sk = process.env.STRIPE_SECRET_KEY;
if (!sk) {
  console.error("STRIPE_SECRET_KEY not set");
  process.exit(1);
}

async function stripePost(path, params) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sk}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path} failed: ${json.error?.message}`);
  return json;
}

async function main() {
  // ── Product: Blackglass Team ──────────────────────────────────────────────
  const prod = await stripePost("/products", {
    name: "Blackglass Team",
    description:
      "Up to 25 hosts, 5 users, scheduled scans, fleet dashboard, evidence bundles, Slack/webhook alerts, 180-day drift history, API access.",
    "metadata[plan]": "pro",
  });
  console.log(`✓ Product created: ${prod.id}  (${prod.name})`);

  // ── Price: $29 / month ────────────────────────────────────────────────────
  const monthly = await stripePost("/prices", {
    product: prod.id,
    unit_amount: "2900",
    currency: "usd",
    "recurring[interval]": "month",
    nickname: "Blackglass Team — Monthly",
    "metadata[plan]": "pro",
  });
  console.log(`✓ Monthly price: ${monthly.id}  $${monthly.unit_amount / 100}/month`);

  // ── Price: $290 / year (2 months free) ───────────────────────────────────
  const annual = await stripePost("/prices", {
    product: prod.id,
    unit_amount: "29000",
    currency: "usd",
    "recurring[interval]": "year",
    nickname: "Blackglass Team — Annual (2 months free)",
    "metadata[plan]": "pro",
  });
  console.log(`✓ Annual price:  ${annual.id}  $${annual.unit_amount / 100}/year`);

  console.log("\n── Set these in Doppler + App Platform: ──────────────────────");
  console.log(`STRIPE_PRO_PRICE_ID=${monthly.id}   ← default (monthly)`);
  console.log(`STRIPE_PRO_ANNUAL_PRICE_ID=${annual.id}`);
  console.log(`STRIPE_PRODUCT_PRO=${prod.id}`);
  console.log(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<your pk_test_... key>`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
