#!/usr/bin/env node
/**
 * Static validation for unattended GitHub Actions jobs: every
 * `node scripts/...` reference under .github/workflows must resolve to a file.
 *
 * Usage:
 *   node scripts/ops-automation-selfcheck.mjs
 *
 * In CI, writes $GITHUB_STEP_SUMMARY when set.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const wfDir = path.join(root, ".github", "workflows");

const SCRIPT_RE = /node\s+(scripts\/[A-Za-z0-9_./-]+\.(?:mjs|mts|ts|js))\b/g;

function collectRefs() {
  const byWorkflow = new Map();
  if (!fs.existsSync(wfDir)) {
    console.error("Missing .github/workflows");
    process.exit(1);
  }
  for (const name of fs.readdirSync(wfDir)) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    const full = path.join(wfDir, name);
    const text = fs.readFileSync(full, "utf8");
    const hits = new Set();
    let m;
    const re = new RegExp(SCRIPT_RE.source, "g");
    while ((m = re.exec(text)) !== null) {
      hits.add(m[1]);
    }
    if (hits.size) byWorkflow.set(name, [...hits].sort());
  }
  return byWorkflow;
}

function main() {
  const byWorkflow = collectRefs();
  const allScripts = new Set();
  for (const arr of byWorkflow.values()) for (const s of arr) allScripts.add(s);

  const missing = [];
  for (const rel of [...allScripts].sort()) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) missing.push(rel);
  }

  const lines = [];
  lines.push("## Ops automation self-check");
  lines.push("");
  lines.push("| Workflow | Referenced `node scripts/…` |");
  lines.push("|----------|------------------------------|");
  for (const [wf, refs] of [...byWorkflow.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`| \`${wf}\` | ${refs.map((r) => `\`${r}\``).join("<br>")} |`);
  }
  lines.push("");
  if (missing.length) {
    lines.push("### Missing script files");
    for (const m of missing) lines.push(`- \`${m}\` — **not found on disk**`);
    lines.push("");
  } else {
    lines.push("All referenced script paths exist.");
    lines.push("");
  }

  const body = lines.join("\n");
  console.log(body);

  const sum = process.env.GITHUB_STEP_SUMMARY;
  if (sum) fs.appendFileSync(sum, body + "\n");

  if (missing.length) {
    console.error("\n[ops-automation-selfcheck] FAILED — missing files:", missing.join(", "));
    process.exit(1);
  }
}

main();
