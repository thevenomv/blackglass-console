#!/usr/bin/env node
/**
 * Lightweight operator CLI (no extra deps).
 * Usage:
 *   node scripts/blackglassctl.mjs health [--base=http://127.0.0.1:3000]
 *   node scripts/blackglassctl.mjs scans:enqueue [--base=...] [--body={"host_ids":[]}]
 */
import process from "node:process";

const args = process.argv.slice(2);
const cmd = args[0];
const baseArg = args.find((a) => a.startsWith("--base="));
const base = (baseArg?.split("=", 2)[1] ?? process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);

async function main() {
  if (cmd === "health") {
    const res = await fetch(`${base}/api/health`);
    const j = await res.json();
    console.log(JSON.stringify({ ok: res.ok, status: res.status, body: j }, null, 2));
    process.exit(res.ok ? 0 : 1);
  }
  if (cmd === "scans:enqueue") {
    const bodyArg = args.find((a) => a.startsWith("--body="));
    const bodyRaw = bodyArg?.split("=", 2)[1] ?? '{"host_ids":[]}';
    const res = await fetch(`${base}/api/v1/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: bodyRaw,
    });
    const text = await res.text();
    console.log(res.status, text);
    process.exit(res.ok ? 0 : 1);
  }
  console.log(`Usage:
  node scripts/blackglassctl.mjs health [--base=URL]
  node scripts/blackglassctl.mjs scans:enqueue [--base=URL] [--body=JSON]
`);
  process.exit(cmd ? 2 : 0);
}

await main();
