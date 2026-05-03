#!/usr/bin/env node
/**
 * Run all SQL migrations in docs/migrations/ against DATABASE_URL.
 * Usage: DATABASE_URL="..." node scripts/run-migrations.mjs
 */
import { createRequire } from "module";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const pg = require("pg");
const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "../docs/migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL");
  process.exit(1);
}

// Strip sslmode from URL so pg connection-string parser doesn't override our ssl config
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("Connected to database\n");

// Ensure migrations tracking table
await client.query(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

const applied = new Set(
  (await client.query("SELECT name FROM _migrations")).rows.map((r) => r.name)
);

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let ran = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`SKIP ${file} (already applied)`);
    continue;
  }
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  console.log(`RUN  ${file} ...`);
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO _migrations(name) VALUES($1)", [file]);
    await client.query("COMMIT");
    console.log(`OK   ${file}`);
    ran++;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`FAIL ${file}: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(`\nDone. ${ran} migration(s) applied.`);
