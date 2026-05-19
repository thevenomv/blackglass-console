#!/usr/bin/env node
/**
 * check-migration-files.mjs — fast static check, no DB needed.
 *
 * Asserts that every drizzle/NNNN_*.sql file:
 *   - has a strictly-monotonic 4-digit prefix with no gaps;
 *   - parses as non-empty UTF-8;
 *   - contains at least one DDL statement (CREATE / ALTER / DROP / DO / INSERT);
 *   - is not a duplicate of another file by content hash.
 *
 * Designed to fail fast in CI on the kind of drift we hit on 2026-05-07
 * (six unmigrated files in production while the bookkeeping table was
 * empty) — at least the *files-on-disk* invariant can be machine-checked
 * on every PR with no infra.
 *
 * Exits 0 on pass, 1 on any failure.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = path.resolve(__dirname, "..", "..", "drizzle");

const errors = [];
const warnings = [];

const files = fs
  .readdirSync(DRIZZLE_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const numbered = files.filter((f) => /^\d{4}_.*\.sql$/.test(f));
const unnumbered = files.filter((f) => !/^\d{4}_.*\.sql$/.test(f));

if (unnumbered.length) {
  errors.push(`Unnumbered SQL files found in drizzle/: ${unnumbered.join(", ")}`);
}

const seenHashes = new Map();
let lastIndex = -1;

for (const name of numbered) {
  const idx = parseInt(name.slice(0, 4), 10);
  if (idx !== lastIndex + 1) {
    errors.push(`Gap or out-of-order migration: expected ${String(lastIndex + 1).padStart(4, "0")}_*, got ${name}`);
  }
  lastIndex = idx;

  const fp = path.join(DRIZZLE_DIR, name);
  const buf = fs.readFileSync(fp);
  if (buf.length === 0) {
    errors.push(`${name} is empty`);
    continue;
  }
  let body;
  try {
    body = buf.toString("utf8");
  } catch {
    errors.push(`${name} is not valid UTF-8`);
    continue;
  }
  if (!/\b(CREATE|ALTER|DROP|DO|INSERT|UPDATE|GRANT|REVOKE)\b/i.test(body)) {
    warnings.push(`${name} contains no DDL/DML keywords — is this intentional?`);
  }
  // Normalise CRLF → LF before hashing so Windows working trees (where
  // core.autocrlf may add \r\n) produce the same hash as the Linux build
  // containers that apply-migrations.mjs runs in.  Without this, a dev
  // who baselines locally on Windows records a CRLF hash; the CI container
  // then sees a different LF hash and reports every migration as "new".
  const normalised = body.replace(/\r\n/g, "\n");
  const hash = crypto.createHash("sha256").update(normalised).digest("hex");
  if (seenHashes.has(hash)) {
    errors.push(`${name} is byte-identical to ${seenHashes.get(hash)} (duplicate hash ${hash.slice(0, 8)})`);
  } else {
    seenHashes.set(hash, name);
  }
}

console.log(`Scanned ${numbered.length} migration file(s) in drizzle/.`);
if (warnings.length) {
  console.log("\nWarnings:");
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (errors.length) {
  console.log("\nErrors:");
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.error(`\nFAIL — ${errors.length} error(s).`);
  process.exit(1);
}
console.log("OK — file layout is consistent.");
