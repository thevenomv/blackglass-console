#!/usr/bin/env node
/**
 * CI guard: every withBypassRls( callsite must pair with a greppable // RLS-BYPASS:
 * tag line (see JSDoc on withBypassRls in src/db/index.ts).
 *
 * Enforces a 1:1 count: single-line // RLS-BYPASS: comments vs non-JSDoc lines
 * containing withBypassRls( (skips star-prefixed JSDoc lines, e.g. the example in
 * src/db/index.ts).
 *
 * Exit 1 if counts differ or if zero calls are detected (sanity).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcRoot = path.join(root, "src");

const TAG_RE = /^\s*\/\/\s*RLS-BYPASS:/;
const CALL_SUBSTR = "withBypassRls(";
const JSDOC_LINE_RE = /^\s*\*/;

/** @param {string} dir */
function walkTsFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walkTsFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const files = walkTsFiles(srcRoot);
  let tagLines = 0;
  let callLines = 0;

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (TAG_RE.test(line)) tagLines += 1;
      if (line.includes(CALL_SUBSTR) && !JSDOC_LINE_RE.test(line)) {
        callLines += 1;
      }
    }
  }

  if (callLines === 0) {
    console.error("check-rls-bypass-tags: expected at least one withBypassRls( callsite under src/");
    process.exit(1);
  }

  if (tagLines !== callLines) {
    console.error(
      "check-rls-bypass-tags: mismatch between // RLS-BYPASS: tag lines and withBypassRls( call lines.\n" +
        `  RLS-BYPASS tags: ${tagLines}\n` +
        `  withBypassRls calls: ${callLines}\n` +
        "  Fix: add a single-line // RLS-BYPASS: <reason> immediately before each new bypass call,\n" +
        "  or remove stray tags / calls. See src/db/index.ts (withBypassRls JSDoc).",
    );
    process.exit(1);
  }

  console.log(`check-rls-bypass-tags: OK (${tagLines} tagged bypass callsites)`);
}

main();
