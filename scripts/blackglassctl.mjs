#!/usr/bin/env node
/**
 * Lightweight operator CLI (no extra deps beyond postgres for the db commands).
 *
 * HTTP commands (require a running app):
 *   node scripts/blackglassctl.mjs health [--base=http://127.0.0.1:3000]
 *   node scripts/blackglassctl.mjs scans:enqueue [--base=...] [--body={"host_ids":[]}]
 *
 * Break-glass DB commands (require DATABASE_URL; bypass RLS directly):
 *   node scripts/blackglassctl.mjs provision-tenant --clerk-org=<id> --name=<name> [--stripe-sub=<id>] [--stripe-customer=<id>]
 *   node scripts/blackglassctl.mjs reconcile-tenant --clerk-org=<id>
 *
 * These are manual recovery tools for situations where a Stripe or Clerk webhook
 * was swallowed (network partition, queue back-pressure, etc.) and a customer's
 * workspace is stuck in an incorrect state. Run against the direct DB port (not
 * pgBouncer) from a trusted network.
 */
import process from "node:process";

const args = process.argv.slice(2);
const cmd = args[0];
const baseArg = args.find((a) => a.startsWith("--base="));
const base = (baseArg?.split("=", 2)[1] ?? process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);

async function main() {
  if (cmd === "health") {
    const res = await fetch(`${base}/api/health`);
    const j = await res.json();
    console.log(JSON.stringify({ ok: res.ok, status: res.status, body: j }, null, 2));
    process.exit(res.ok ? 0 : 1);
  }
  if (cmd === "scans:enqueue") {
    const bodyArg = args.find((a) => a.startsWith("--body="));
    const bodyRaw = bodyArg?.split("=", 2)[1] ?? '{"host_ids":[]}';
    const res = await fetch(`${base}/api/v1/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: bodyRaw,
    });
    const text = await res.text();
    console.log(res.status, text);
    process.exit(res.ok ? 0 : 1);
  }

  // -------------------------------------------------------------------------
  // Break-glass: provision-tenant
  // Manually create (or ensure) a tenant row + trial subscription for a Clerk
  // org. Use when the org.created webhook was swallowed and the customer can
  // sign in but sees no workspace.
  //
  //   DATABASE_URL=... node scripts/blackglassctl.mjs provision-tenant \
  //     --clerk-org=org_abc123 --name="Acme Corp"
  // -------------------------------------------------------------------------
  if (cmd === "provision-tenant") {
    const clerkOrg = arg("--clerk-org");
    const name = arg("--name") ?? clerkOrg;
    if (!clerkOrg) {
      console.error("provision-tenant requires --clerk-org=<clerkOrgId>");
      process.exit(2);
    }
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (!dbUrl) {
      console.error("DATABASE_URL is required for provision-tenant");
      process.exit(2);
    }
    const pg = await import("pg");
    const client = new pg.default.Client({ connectionString: dbUrl });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.bypass_rls', '1', true)");

      // Check if tenant already exists
      const existing = await client.query(
        "SELECT id, name FROM saas_tenants WHERE clerk_org_id = $1 LIMIT 1",
        [clerkOrg],
      );
      if (existing.rows[0]) {
        console.log("Tenant already exists:", existing.rows[0]);
        await client.query("ROLLBACK");
        process.exit(0);
      }

      // Insert tenant
      const tenantRes = await client.query(
        "INSERT INTO saas_tenants (clerk_org_id, name) VALUES ($1, $2) RETURNING id, name",
        [clerkOrg, name],
      );
      const tenant = tenantRes.rows[0];

      // Insert trial subscription (14 days)
      const trialEndsAt = new Date(Date.now() + 14 * 86400 * 1000);
      await client.query(
        `INSERT INTO saas_subscriptions
          (tenant_id, plan_code, status, trial_ends_at, host_limit, paid_seat_limit, features)
         VALUES ($1, 'trial', 'trialing', $2, 10, 2, '{}')`,
        [tenant.id, trialEndsAt.toISOString()],
      );

      await client.query("COMMIT");
      console.log(JSON.stringify({ ok: true, tenant }, null, 2));
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("provision-tenant failed:", err);
      process.exit(1);
    } finally {
      await client.end();
    }
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // Break-glass: reconcile-tenant
  // Print the current DB state for a Clerk org so you can diagnose a stuck
  // subscription without needing a Stripe dashboard.
  //
  //   DATABASE_URL=... node scripts/blackglassctl.mjs reconcile-tenant \
  //     --clerk-org=org_abc123
  // -------------------------------------------------------------------------
  if (cmd === "reconcile-tenant") {
    const clerkOrg = arg("--clerk-org");
    if (!clerkOrg) {
      console.error("reconcile-tenant requires --clerk-org=<clerkOrgId>");
      process.exit(2);
    }
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (!dbUrl) {
      console.error("DATABASE_URL is required for reconcile-tenant");
      process.exit(2);
    }
    const pg = await import("pg");
    const client = new pg.default.Client({ connectionString: dbUrl });
    await client.connect();
    try {
      await client.query("SELECT set_config('app.bypass_rls', '1', true)");
      const tenant = await client.query(
        "SELECT * FROM saas_tenants WHERE clerk_org_id = $1 LIMIT 1",
        [clerkOrg],
      );
      if (!tenant.rows[0]) {
        console.log("No tenant found for clerk_org_id:", clerkOrg);
        process.exit(0);
      }
      const sub = await client.query(
        "SELECT * FROM saas_subscriptions WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 1",
        [tenant.rows[0].id],
      );
      const members = await client.query(
        "SELECT user_id, role, status FROM saas_tenant_memberships WHERE tenant_id = $1",
        [tenant.rows[0].id],
      );
      console.log(JSON.stringify({
        tenant: tenant.rows[0],
        subscription: sub.rows[0] ?? null,
        members: members.rows,
      }, null, 2));
    } finally {
      await client.end();
    }
    process.exit(0);
  }

  console.log(`Usage:
  # HTTP commands (app must be running):
  node scripts/blackglassctl.mjs health [--base=URL]
  node scripts/blackglassctl.mjs scans:enqueue [--base=URL] [--body=JSON]

  # Break-glass DB commands (DATABASE_URL required, use direct port not pgBouncer):
  node scripts/blackglassctl.mjs provision-tenant --clerk-org=<id> [--name=<name>]
  node scripts/blackglassctl.mjs reconcile-tenant --clerk-org=<id>
`);
  process.exit(cmd ? 2 : 0);
}

function arg(flag) {
  const match = args.find((a) => a.startsWith(flag + "="));
  return match?.split("=", 2)[1] ?? null;
}

await main();
