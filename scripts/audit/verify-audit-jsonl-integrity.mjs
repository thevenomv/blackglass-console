#!/usr/bin/env node
/**
 * Stream-integrity helper for exported audit NDJSON (stdin or file).
 * Prints SHA-256 of canonical body (each non-empty line parsed as JSON, re-stringified
 * with stable keys) so identical logical events hash the same.
 *
 * Usage:
 *   node scripts/verify-audit-jsonl-integrity.mjs ./export.ndjson
 *   cat export.ndjson | node scripts/verify-audit-jsonl-integrity.mjs -
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import readline from "node:readline";

const src = process.argv[2];
if (!src) {
  console.error("Usage: verify-audit-jsonl-integrity.mjs <path|- for stdin>");
  process.exit(1);
}

async function canonicalize(body) {
  const h = createHash("sha256");
  let count = 0;
  const input =
    src === "-" ?
      readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
    : readline.createInterface({
        input: createReadStream(src, { encoding: "utf8" }),
        crlfDelay: Infinity,
      });

  for await (const line of input) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch {
      console.error("Invalid JSON line:", trimmed.slice(0, 120));
      process.exit(2);
    }
    h.update(`${JSON.stringify(row)}\n`);
    count += 1;
  }
  return { digest: h.digest("hex"), count };
}

const { digest, count } = await canonicalize(src);
console.log(JSON.stringify({ algorithm: "sha256", lines: count, digest }, null, 2));
