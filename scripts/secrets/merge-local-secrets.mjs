#!/usr/bin/env node
/**
 * Merge Resend + Apollo keys from a one-time gitignored file into `.env.local`.
 *
 * 1. npm run secrets:init-local
 * 2. Edit `.local/credentials.json` with real keys (that path is gitignored).
 * 3. npm run secrets:merge-local
 *
 * By default removes `.local/credentials.json` after a successful merge so the
 * file does not linger on disk. Use --keep-source to retain it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const srcPath = path.join(root, ".local", "credentials.json");
const destPath = path.join(root, ".env.local");

const ALLOWED = ["RESEND_API_KEY", "APOLLO_API_KEY"];

const keepSource = process.argv.includes("--keep-source");

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Quote only when needed for dotenv-style parsers. */
function formatValue(v) {
  const s = String(v).trim();
  if (!s) return "";
  if (/[\s#"']/.test(s) || s.includes("=")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

function upsertEnvBlock(content, entries) {
  const lines = (content ?? "").split(/\r?\n/);
  const keysDone = new Set();
  const out = [];

  for (const line of lines) {
    let replaced = false;
    let skipDuplicate = false;
    for (const [key, val] of entries) {
      const re = new RegExp(`^\\s*${escapeRe(key)}\\s*=`);
      if (re.test(line) && !/^\s*#/.test(line)) {
        if (keysDone.has(key)) {
          skipDuplicate = true;
          break;
        }
        out.push(`${key}=${formatValue(val)}`);
        keysDone.add(key);
        replaced = true;
        break;
      }
    }
    if (skipDuplicate) continue;
    if (!replaced) out.push(line);
  }

  const toAppend = entries.filter(([k]) => keysDone.has(k) === false);
  if (toAppend.length) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push("# --- Merged by scripts/merge-local-secrets.mjs ---");
    for (const [key, val] of toAppend) {
      out.push(`${key}=${formatValue(val)}`);
    }
  }

  return out.join("\n");
}

function main() {
  if (!fs.existsSync(srcPath)) {
    console.error(`Missing ${path.relative(root, srcPath)}`);
    console.error("Run: npm run secrets:init-local");
    console.error("Then paste keys into that file and run this script again.");
    process.exit(1);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(srcPath, "utf8"));
  } catch (e) {
    console.error("Invalid JSON in .local/credentials.json:", e.message);
    process.exit(1);
  }

  const entries = [];
  for (const key of ALLOWED) {
    const v = raw[key];
    const s = v == null ? "" : String(v).trim();
    if (!s || s.includes("REPLACE_ME")) continue;
    entries.push([key, s]);
  }

  if (!entries.length) {
    console.error("No usable keys in .local/credentials.json (fill RESEND_API_KEY and/or APOLLO_API_KEY).");
    process.exit(1);
  }

  let prior = "";
  if (fs.existsSync(destPath)) {
    prior = fs.readFileSync(destPath, "utf8");
  }

  const merged = upsertEnvBlock(prior, entries);
  fs.writeFileSync(destPath, merged.endsWith("\n") ? merged : merged + "\n", "utf8");
  console.log(`[secrets:merge-local] updated ${path.relative(root, destPath)} (${entries.map(([k]) => k).join(", ")})`);

  if (!keepSource) {
    fs.unlinkSync(srcPath);
    console.log(`[secrets:merge-local] removed ${path.relative(root, srcPath)}`);
  } else {
    console.log("[secrets:merge-local] kept source (--keep-source)");
  }

  console.log("Next: npm run secrets:verify");
}

main();
