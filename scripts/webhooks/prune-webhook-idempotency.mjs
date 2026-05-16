#!/usr/bin/env node
/**
 * Deletes saas_webhook_idempotency rows older than --days (default 30).
 * Usage: DATABASE_URL=... node scripts/prune-webhook-idempotency.mjs [--days=30]
 */
import pg from "pg";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const days = Math.max(1, parseInt(args.days ?? "30", 10) || 30);

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const cutoff = new Date(Date.now() - days * 86400000).toISOString();
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const r = await client.query(`DELETE FROM saas_webhook_idempotency WHERE created_at < $1`, [cutoff]);
  console.log(`saas_webhook_idempotency deleted: ${r.rowCount ?? 0} (older than ${days}d)`);
} finally {
  await client.end();
}
