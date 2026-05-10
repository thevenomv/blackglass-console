#!/usr/bin/env node
/**
 * Idempotent Stripe product + price provisioner for the Blackglass plan ladder.
 *
 * Mirrors the canonical pricing in src/lib/saas/plans.ts so that any reviewer
 * can reconcile Stripe ↔ code with a single read. Re-running this script is
 * safe — products are matched by `metadata.plan` and prices by `lookup_key`,
 * so existing SKUs are reused, never duplicated.
 *
 * Usage:
 *   doppler run -- node scripts/stripe-setup.mjs              # provision in current config
 *   doppler run -- node scripts/stripe-setup.mjs --dry-run    # show what would happen
 *
 * The script reads STRIPE_SECRET_KEY from the environment and prints the
 * Doppler commands the operator should run to wire the resulting IDs into
 * the deployment. It NEVER writes secrets to disk and refuses to accept
 * a key as a CLI argument.
 *
 * Modes:
 *   - sk_test_*  → silent, creates test products
 *   - sk_live_*  → requires --i-mean-live confirmation flag (live products
 *                  show up on real invoices and are hard to delete)
 */

const sk = process.env.STRIPE_SECRET_KEY?.trim();
if (!sk) {
  console.error("STRIPE_SECRET_KEY not set. Run via `doppler run -- node scripts/stripe-setup.mjs`.");
  process.exit(1);
}

const isLive = sk.startsWith("sk_live_");
const isTest = sk.startsWith("sk_test_");
if (!isLive && !isTest) {
  console.error("STRIPE_SECRET_KEY does not look like a Stripe secret key (expected sk_test_… or sk_live_…).");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const liveConfirmed = args.has("--i-mean-live");

if (isLive && !liveConfirmed) {
  console.error("Refusing to provision against LIVE Stripe without --i-mean-live.");
  console.error("Re-run with: doppler run -- node scripts/stripe-setup.mjs --i-mean-live");
  process.exit(2);
}

console.log(`Mode:  ${isLive ? "LIVE  ⚠" : "test"}${dryRun ? "  (dry-run, no API writes)" : ""}`);
console.log(`Stripe key: ${sk.slice(0, 8)}…${sk.slice(-4)}`);
console.log("");

// ───────────────────────────────────────────────────────────────────────────
// Catalogue — must mirror src/lib/saas/plans.ts. Amounts in USD cents.
// ───────────────────────────────────────────────────────────────────────────

/** @typedef {{ code: string, name: string, description: string, monthlyCents: number, monthlyEnv: string, annualEnv: string }} TierSpec */

/** @type {TierSpec[]} */
const TIERS = [
  {
    code: "starter",
    name: "Blackglass Starter",
    description: "15 hosts · 3 operator seats · drift detection · 4 scans/day · webhook alerts",
    monthlyCents: 5_900,
    monthlyEnv: "STRIPE_STARTER_PRICE_ID",
    annualEnv: "STRIPE_STARTER_ANNUAL_PRICE_ID",
  },
  {
    code: "team",
    name: "Blackglass Team",
    description: "25 hosts · 3 operator seats · hourly scans · full API · 90-day drift history",
    monthlyCents: 8_900,
    monthlyEnv: "STRIPE_TEAM_PRICE_ID",
    annualEnv: "STRIPE_TEAM_ANNUAL_PRICE_ID",
  },
  {
    code: "growth",
    name: "Blackglass Growth",
    description: "100 hosts · 5 operator seats · fleet dashboard · 180-day drift · Charon live cleanup",
    monthlyCents: 19_900,
    monthlyEnv: "STRIPE_GROWTH_PRICE_ID",
    annualEnv: "STRIPE_GROWTH_ANNUAL_PRICE_ID",
  },
  {
    code: "scale",
    name: "Blackglass Scale",
    description: "200 hosts · 7 operator seats · host groups · approval workflows · 365-day drift",
    monthlyCents: 34_900,
    monthlyEnv: "STRIPE_SCALE_PRICE_ID",
    annualEnv: "STRIPE_SCALE_ANNUAL_PRICE_ID",
  },
  {
    code: "business",
    name: "Blackglass Business",
    description: "300 hosts · 10 operator seats · immutable audit · Remediator included",
    monthlyCents: 49_900,
    monthlyEnv: "STRIPE_BUSINESS_PRICE_ID",
    annualEnv: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
  },
];

/** @typedef {{ code: string, name: string, description: string, monthlyCents: number, monthlyEnv: string, annualEnv: string }} AddonSpec */

/** @type {AddonSpec[]} */
const ADDONS = [
  {
    code: "remediator",
    name: "Blackglass Remediator (HITL AI)",
    description: "250 included remediation actions/month, $0.10 per extra (Growth & Scale add-on)",
    monthlyCents: 9_900,
    monthlyEnv: "STRIPE_REMEDIATOR_PRICE_ID",
    annualEnv: "STRIPE_REMEDIATOR_ANNUAL_PRICE_ID",
  },
  {
    code: "charon",
    name: "Blackglass Charon (cloud janitor)",
    description: "Linked-cloud-account boost + cleanup queue (see plan pairing in docs)",
    monthlyCents: 4_900,
    monthlyEnv: "STRIPE_CHARON_PRICE_ID",
    annualEnv: "STRIPE_CHARON_ANNUAL_PRICE_ID",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Stripe REST helpers — keep deps zero (no `stripe` npm package needed).
// ───────────────────────────────────────────────────────────────────────────

async function stripeRequest(method, path, params) {
  const url = new URL(`https://api.stripe.com/v1${path}`);
  let body;
  if (method === "GET" && params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(`${k}[]`, String(item));
      } else if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
  } else if (params) {
    body = new URLSearchParams(params).toString();
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${sk}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2024-06-20",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path} → ${res.status}: ${json.error?.message ?? JSON.stringify(json)}`);
  }
  return json;
}

const get = (path, params) => stripeRequest("GET", path, params);
const post = (path, params) => (dryRun ? Promise.resolve({ id: `dryrun_${path.split("/").pop()}_${Math.random().toString(36).slice(2, 10)}`, _dryRun: true }) : stripeRequest("POST", path, params));

// ───────────────────────────────────────────────────────────────────────────
// Idempotent upsert helpers.
// ───────────────────────────────────────────────────────────────────────────

async function findProductByPlanMetadata(planCode) {
  // Stripe's product list doesn't filter by metadata server-side, so we
  // page through active products and filter client-side. With ≤ ~10
  // products this is cheap.
  let starting_after;
  for (let page = 0; page < 5; page++) {
    const resp = await get("/products", { active: "true", limit: 100, starting_after });
    const match = resp.data.find((p) => p.metadata?.plan === planCode);
    if (match) return match;
    if (!resp.has_more) return null;
    starting_after = resp.data[resp.data.length - 1]?.id;
  }
  return null;
}

async function findPriceByLookupKey(lookupKey) {
  const resp = await get("/prices", { active: "true", lookup_keys: [lookupKey], limit: 1 });
  return resp.data?.[0] ?? null;
}

async function upsertProduct(spec) {
  const existing = await findProductByPlanMetadata(spec.code);
  if (existing) {
    console.log(`  • product ${spec.code.padEnd(11)} ${existing.id}  (existing)`);
    return existing;
  }
  const created = await post("/products", {
    name: spec.name,
    description: spec.description,
    "metadata[plan]": spec.code,
    "metadata[managed_by]": "scripts/stripe-setup.mjs",
  });
  console.log(`  + product ${spec.code.padEnd(11)} ${created.id}  (created${created._dryRun ? ", dry-run" : ""})`);
  return created;
}

async function upsertPrice(productId, spec, interval) {
  const lookupKey = `${spec.code}_${interval === "month" ? "monthly" : "annual"}`;
  const cents = interval === "month" ? spec.monthlyCents : spec.monthlyCents * 10;
  const existing = await findPriceByLookupKey(lookupKey);
  if (existing) {
    if (existing.unit_amount !== cents) {
      console.log(`  ! price   ${lookupKey.padEnd(20)} ${existing.id}  AMOUNT MISMATCH: stripe=${existing.unit_amount} expected=${cents} (NOT updated; archive in Stripe and re-run to roll the price)`);
    } else {
      console.log(`  • price   ${lookupKey.padEnd(20)} ${existing.id}  $${cents / 100}/${interval}  (existing)`);
    }
    return existing;
  }
  const created = await post("/prices", {
    product: productId,
    unit_amount: String(cents),
    currency: "usd",
    "recurring[interval]": interval,
    nickname: `${spec.name} — ${interval === "month" ? "Monthly" : "Annual (2 months free)"}`,
    lookup_key: lookupKey,
    transfer_lookup_key: "true",
    "metadata[plan]": spec.code,
    "metadata[managed_by]": "scripts/stripe-setup.mjs",
  });
  console.log(`  + price   ${lookupKey.padEnd(20)} ${created.id}  $${cents / 100}/${interval}  (created${created._dryRun ? ", dry-run" : ""})`);
  return created;
}

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────

async function provision(spec) {
  console.log(`Provisioning ${spec.name}`);
  const product = await upsertProduct(spec);
  const monthly = await upsertPrice(product.id, spec, "month");
  const annual = await upsertPrice(product.id, spec, "year");
  return { spec, product, monthly, annual };
}

async function main() {
  const allSpecs = [...TIERS, ...ADDONS];
  const results = [];
  for (const spec of allSpecs) {
    results.push(await provision(spec));
    console.log("");
  }

  console.log("─".repeat(80));
  console.log("Doppler set commands — paste into your shell after reviewing the IDs above:");
  console.log(`(target the config that matches this Stripe key — ${isLive ? "prd" : "dev / stg"})`);
  console.log("");

  const lines = [];
  for (const { spec, monthly, annual } of results) {
    lines.push(`doppler secrets set ${spec.monthlyEnv}=${monthly.id}`);
    lines.push(`doppler secrets set ${spec.annualEnv}=${annual.id}`);
  }
  console.log(lines.join("\n"));
  console.log("");
  console.log("Or as a single env-style block for `doppler secrets upload`:");
  console.log("");
  for (const { spec, monthly, annual } of results) {
    console.log(`${spec.monthlyEnv}=${monthly.id}`);
    console.log(`${spec.annualEnv}=${annual.id}`);
  }
}

main().catch((err) => {
  console.error("");
  console.error("FAILED:", err.message);
  process.exit(1);
});
