#!/usr/bin/env node
/**
 * run-migration-008.mjs
 *
 * Applies migration 008 (subscription_status ENUM: add 'past_due').
 *
 * WHY A CUSTOM SCRIPT?
 * PostgreSQL does not allow `ALTER TYPE ... ADD VALUE` inside a transaction block.
 * `drizzle-kit migrate` wraps every migration in BEGIN/COMMIT, so migration 008
 * must be executed separately, outside any transaction.
 *
 * REQUIREMENTS:
 *   - DATABASE_URL must point to the direct Postgres port (25060), NOT pgBouncer (25061).
 *   - Run BEFORE deploying application code that reads `subscription_status`.
 *
 * USAGE:
 *   DATABASE_URL=postgresql://... node scripts/run-migration-008.mjs
 *   # Or via Doppler:
 *   doppler run -- node scripts/run-migration-008.mjs
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(__dirname, "../docs/migrations/008_subscription_status_past_due.sql");

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

if (url.includes(":25061")) {
  console.error(
    "ERROR: DATABASE_URL points to pgBouncer port 25061.\n" +
      "ALTER TYPE ... ADD VALUE cannot run through pgBouncer.\n" +
      "Use the direct Postgres port 25061 → 25060 in DATABASE_URL.",
  );
  process.exit(1);
}

// Strip sslmode from URL and use explicit ssl options (DO managed Postgres quirk).
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const sslOpts = url.includes("sslmode=") ? { ssl: { rejectUnauthorized: false } } : {};

const client = new pg.Client({ connectionString: cleanUrl, ...sslOpts });

async function run() {
  await client.connect();
  console.log("[migration-008] Connected to Postgres.");

  const sql = readFileSync(SQL_PATH, "utf8").trim();
  console.log(`[migration-008] Executing:\n${sql}\n`);

  // Execute OUTSIDE a transaction — ALTER TYPE ... ADD VALUE requires this.
  await client.query(sql);

  console.log("[migration-008] Done. 'past_due' added to subscription_status enum.");
  await client.end();
}

run().catch((err) => {
  console.error("[migration-008] FAILED:", err.message);
  client.end().catch(() => {});
  process.exit(1);
});
