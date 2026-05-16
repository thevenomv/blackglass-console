#!/usr/bin/env node
/**
 * Reconciliation: Postgres SaaS rows vs Stripe subscriptions; optional Clerk org census.
 * Complements webhooks — run daily via cron / GitHub Actions. Alerts via console;
 * set SLACK_ALERT_WEBHOOK_URL to also post a summary when mismatches exist.
 *
 * Usage:
 *   DATABASE_URL=... STRIPE_SECRET_KEY=sk_live_... node scripts/reconcile-saas-billing.mjs
 *
 * Optional:
 *   CLERK_SECRET_KEY=... RECONCILE_CLERK_ORGS=1  — flag Clerk orgs with no saas_tenants row (noisy if orgs exist pre-provision)
 */
import pg from "pg";
import Stripe from "stripe";

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function slack(text) {
  const url = process.env.SLACK_ALERT_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("[reconcile] slack failed", e);
  }
}

const dbUrl = process.env.DATABASE_URL?.trim();
const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
const clerkKey = process.env.CLERK_SECRET_KEY?.trim();
const clerkCensus = process.env.RECONCILE_CLERK_ORGS === "1" || process.env.RECONCILE_CLERK_ORGS === "true";

if (!dbUrl || !stripeKey) {
  console.error("DATABASE_URL and STRIPE_SECRET_KEY are required.");
  process.exit(1);
}

const stripe = new Stripe(stripeKey, {
  apiVersion: "2026-04-22.dahlia",
});
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

const mismatches = [];

try {
  await client.query(`SELECT set_config('app.bypass_rls', '1', false)`);

  const { rows: subs } = await client.query(`
    SELECT t.id AS tenant_id, t.clerk_org_id, t.name AS tenant_name,
           s.stripe_customer_id, s.stripe_subscription_id, s.status AS db_status, s.plan_code
    FROM saas_subscriptions s
    JOIN saas_tenants t ON t.id = s.tenant_id
  `);

  for (const row of subs) {
    const sid = row.stripe_subscription_id?.trim();
    if (!sid) continue;
    try {
      const live = await stripe.subscriptions.retrieve(sid);
      const liveStatus = live.status;
      if (
        (liveStatus === "canceled" || liveStatus === "unpaid" || liveStatus === "incomplete_expired") &&
        (row.db_status === "active" || row.db_status === "trialing")
      ) {
        mismatches.push({
          kind: "stripe_should_not_be_active_in_db",
          tenantId: row.tenant_id,
          clerkOrgId: row.clerk_org_id,
          stripeSubscriptionId: sid,
          dbStatus: row.db_status,
          stripeStatus: liveStatus,
        });
      }
      if (
        (liveStatus === "active" || liveStatus === "trialing") &&
        (row.db_status === "canceled" || row.db_status === "trial_expired")
      ) {
        mismatches.push({
          kind: "stripe_live_but_db_inactive",
          tenantId: row.tenant_id,
          clerkOrgId: row.clerk_org_id,
          stripeSubscriptionId: sid,
          dbStatus: row.db_status,
          stripeStatus: liveStatus,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/No such subscription/i.test(msg) || /resource_missing/i.test(msg)) {
        mismatches.push({
          kind: "stripe_subscription_missing",
          tenantId: row.tenant_id,
          clerkOrgId: row.clerk_org_id,
          stripeSubscriptionId: sid,
          detail: msg,
        });
      } else {
        mismatches.push({
          kind: "stripe_lookup_error",
          tenantId: row.tenant_id,
          stripeSubscriptionId: sid,
          detail: msg,
        });
      }
    }
  }

  if (clerkCensus && clerkKey) {
    const { rows: tenantOrgs } = await client.query(`SELECT clerk_org_id FROM saas_tenants`);
    const dbOrgSet = new Set(tenantOrgs.map((r) => r.clerk_org_id));

    let offset = 0;
    const clerkOrgIds = new Set();
    for (;;) {
      const res = await fetch(
        `https://api.clerk.com/v1/organizations?limit=100&offset=${offset}`,
        { headers: { Authorization: `Bearer ${clerkKey}` } },
      );
      if (!res.ok) {
        mismatches.push({ kind: "clerk_list_error", status: res.status, detail: await res.text() });
        break;
      }
      const body = await res.json();
      const items = body.data ?? [];
      for (const o of items) {
        if (o.id) clerkOrgIds.add(o.id);
      }
      if (items.length < 100) break;
      offset += 100;
      if (offset > 10_000) break;
    }

    for (const oid of clerkOrgIds) {
      if (!dbOrgSet.has(oid)) {
        mismatches.push({
          kind: "clerk_org_not_in_db",
          clerkOrgId: oid,
          detail: "Organization exists in Clerk but has no saas_tenants row",
        });
      }
    }
  } else if (clerkCensus && !clerkKey) {
    console.warn("[reconcile] RECONCILE_CLERK_ORGS set but CLERK_SECRET_KEY missing — skip");
  }

  if (mismatches.length === 0) {
    console.log("[reconcile] OK — no mismatches detected (checks are best-effort).");
    process.exit(0);
  }

  console.error(`[reconcile] ${mismatches.length} issue(s):`);
  for (const m of mismatches) console.error(JSON.stringify(m));
  const sample = chunk(mismatches, 5)[0];
  await slack(
    `:warning: *SaaS reconcile* found ${mismatches.length} issue(s)\n\`\`\`${JSON.stringify(sample, null, 2)}\`\`\``,
  );
  process.exit(2);
} finally {
  await client.end();
}
