#!/usr/bin/env node
/**
 * Deletes old rows from saas_audit_events (and optionally saas_security_events).
 * Usage: DATABASE_URL=... node scripts/prune-saas-audit-events.mjs [--days=90] [--security-too]
 */
import pg from "pg";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const days = Math.max(1, parseInt(args.days ?? "90", 10) || 90);
const securityToo = args["security-too"] === "true";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const cutoff = new Date(Date.now() - days * 86400000).toISOString();
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // RLS-aware deletes: cross-tenant pruning requires bypass (trusted ops script only).
  await client.query(`SELECT set_config('app.bypass_rls', '1', false)`);
  const a = await client.query(`DELETE FROM saas_audit_events WHERE created_at < $1`, [cutoff]);
  console.log(`saas_audit_events deleted: ${a.rowCount ?? 0}`);
  if (securityToo) {
    const s = await client.query(`DELETE FROM saas_security_events WHERE created_at < $1`, [cutoff]);
    console.log(`saas_security_events deleted: ${s.rowCount ?? 0}`);
  }
} finally {
  await client.end();
}
