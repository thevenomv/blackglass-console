#!/usr/bin/env node
/**
 * apply-migrations.mjs — production-grade Drizzle migration runner.
 *
 * Reads every `drizzle/NNNN_*.sql` file in numeric order and applies any whose
 * sha256 hash is not yet recorded in `drizzle.__drizzle_migrations`. Designed to
 * be the single, supported way to run migrations against a Blackglass database.
 *
 * Why we have this on top of `drizzle-kit migrate`:
 *   - We need column-level idempotency (every prod migration uses
 *     `IF NOT EXISTS` / `ON CONFLICT`) so we can adopt schema-drifted
 *     databases without rewriting their state.
 *   - We need a `--baseline` mode for retroactively marking existing prod
 *     state as "migrated" without re-running SQL — used once, after the
 *     incident on 2026-05-07 where the bookkeeping table was empty even
 *     though several migrations had been applied by hand.
 *   - We need a `--check` mode for CI that exits non-zero when files exist
 *     on disk but are not recorded in the bookkeeping table — catches
 *     schema drift the moment it lands in a PR.
 *
 * Connection: reads PG* env vars (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
 * and PGSSLMODE) OR a single DATABASE_URL. Either form works; PG* takes
 * precedence so an operator can override individual fields without rewriting
 * the connection string.
 *
 * Usage:
 *   node scripts/ops/apply-migrations.mjs              # apply pending
 *   node scripts/ops/apply-migrations.mjs --check      # dry-run, exit 1 if any pending
 *   node scripts/ops/apply-migrations.mjs --baseline   # record all files as applied without running
 *   node scripts/ops/apply-migrations.mjs --status     # print what's applied vs pending and exit
 */

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = path.resolve(__dirname, "..", "..", "drizzle");

const FLAG_CHECK = process.argv.includes("--check");
const FLAG_BASELINE = process.argv.includes("--baseline");
const FLAG_STATUS = process.argv.includes("--status");

if ([FLAG_CHECK, FLAG_BASELINE, FLAG_STATUS].filter(Boolean).length > 1) {
  console.error("ERROR: --check, --baseline, and --status are mutually exclusive.");
  process.exit(2);
}

function listMigrationFiles() {
  return fs
    .readdirSync(DRIZZLE_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
}

function loadMigration(name) {
  const sql = fs.readFileSync(path.join(DRIZZLE_DIR, name), "utf8");
  const hash = crypto.createHash("sha256").update(sql).digest("hex");
  return { name, sql, hash };
}

/**
 * Decide whether to negotiate SSL for this connection.
 *
 * Order of precedence (first match wins):
 *   1. `PGSSLMODE` env var — `disable` → no SSL; anything else → SSL on.
 *   2. `sslmode=` in `DATABASE_URL` — same logic.
 *   3. Heuristic: if the host looks like localhost / 127.* / a private
 *      network, default to no SSL (CI Postgres containers, Docker
 *      Compose, dev). Otherwise default to SSL on with a relaxed CA
 *      check (managed Postgres providers terminate TLS but ship their
 *      own CA chain).
 *
 * The relaxed `rejectUnauthorized: false` matches the rest of the
 * codebase (`src/db/index.ts`) — the real CA enforcement happens at the
 * provider edge / network layer.
 */
function decideSslOpt(url) {
  const mode = (process.env.PGSSLMODE ?? "").toLowerCase();
  if (mode === "disable") return false;
  if (mode) return { rejectUnauthorized: false };

  if (url) {
    const m = /[?&]sslmode=([^&]+)/i.exec(url);
    if (m) {
      return m[1].toLowerCase() === "disable" ? false : { rejectUnauthorized: false };
    }
  }

  const host = (
    process.env.PGHOST ??
    (url ? safeParseHost(url) : "") ??
    ""
  ).toLowerCase();
  if (
    host === "" ||
    host === "localhost" ||
    host === "::1" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return false;
  }
  return { rejectUnauthorized: false };
}

function safeParseHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function makeClient() {
  // If DATABASE_URL is the only thing set, use it. Otherwise construct from PG*
  // (which is what the DO managed-DB API gives us in plaintext).
  const url = process.env.DATABASE_URL?.trim();
  const haveAnyPg = ["PGHOST", "PGUSER", "PGPASSWORD"].some((k) => process.env[k]);
  const ssl = decideSslOpt(url);

  if (url && !haveAnyPg) {
    return new Client({ connectionString: url, ssl });
  }
  return new Client({ ssl });
}

async function ensureBookkeeping(c) {
  await c.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await c.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id          serial PRIMARY KEY,
      hash        text NOT NULL UNIQUE,
      name        text,
      created_at  bigint NOT NULL
    )
  `);
  // Older versions of the bookkeeping table (created by drizzle-kit) don't
  // have a `name` column. Add it on the fly so the rest of the script can
  // safely reference it. The UNIQUE on hash is also a no-op if it's already there.
  await c.query("ALTER TABLE drizzle.__drizzle_migrations ADD COLUMN IF NOT EXISTS name text");
  await c.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = '__drizzle_migrations_hash_key'
      ) THEN
        ALTER TABLE drizzle.__drizzle_migrations
          ADD CONSTRAINT __drizzle_migrations_hash_key UNIQUE (hash);
      END IF;
    END$$
  `);
}

async function loadAppliedHashes(c) {
  const r = await c.query("SELECT hash, name FROM drizzle.__drizzle_migrations ORDER BY id");
  return new Map(r.rows.map((row) => [row.hash, row.name]));
}

async function recordApplied(c, m) {
  await c.query(
    `INSERT INTO drizzle.__drizzle_migrations (hash, name, created_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (hash) DO UPDATE SET name = EXCLUDED.name`,
    [m.hash, m.name, Date.now()],
  );
}

async function main() {
  const files = listMigrationFiles();
  if (files.length === 0) {
    console.log("No migration files found in drizzle/. Nothing to do.");
    return;
  }
  const migrations = files.map(loadMigration);

  const c = makeClient();
  await c.connect();
  try {
    await ensureBookkeeping(c);
    const applied = await loadAppliedHashes(c);

    const pending = migrations.filter((m) => !applied.has(m.hash));

    if (FLAG_STATUS) {
      console.log(`Applied: ${applied.size}, Pending: ${pending.length}, Total files: ${migrations.length}`);
      console.log("\nApplied:");
      for (const m of migrations.filter((x) => applied.has(x.hash))) {
        console.log(`  ✓ ${m.name}  (${m.hash.slice(0, 8)})`);
      }
      console.log("\nPending:");
      if (pending.length === 0) console.log("  (none — schema is in sync)");
      for (const m of pending) {
        console.log(`  • ${m.name}  (${m.hash.slice(0, 8)})`);
      }
      return;
    }

    if (FLAG_CHECK) {
      if (pending.length === 0) {
        console.log(`OK — ${applied.size} applied, 0 pending.`);
        return;
      }
      console.error(`SCHEMA DRIFT: ${pending.length} migration(s) not applied:`);
      for (const m of pending) console.error(`  • ${m.name}`);
      console.error("\nRun this script without --check to apply them, or --baseline if they were already applied by hand.");
      process.exit(1);
    }

    if (FLAG_BASELINE) {
      console.log(`Baselining ${migrations.length} migration files (recording without running) ...`);
      for (const m of migrations) {
        if (applied.has(m.hash)) {
          console.log(`  = ${m.name}  already recorded, skipping`);
          continue;
        }
        await recordApplied(c, m);
        console.log(`  ✓ ${m.name}  recorded`);
      }
      console.log("Done. Subsequent --check runs will report 0 pending.");
      return;
    }

    if (pending.length === 0) {
      console.log(`OK — ${applied.size} applied, 0 pending.`);
      return;
    }
    console.log(`Applying ${pending.length} migration(s):`);
    for (const m of pending) {
      console.log(`  → ${m.name} (${m.hash.slice(0, 8)})`);
      try {
        await c.query("BEGIN");
        await c.query(m.sql);
        await recordApplied(c, m);
        await c.query("COMMIT");
        console.log(`     ✓ applied`);
      } catch (err) {
        await c.query("ROLLBACK");
        console.error(`     ✗ failed: ${err.message}`);
        if (err.position) console.error(`       at position ${err.position}`);
        throw err;
      }
    }
    console.log(`\nDone. ${pending.length} migration(s) applied.`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
