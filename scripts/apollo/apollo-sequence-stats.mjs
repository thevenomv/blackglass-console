#!/usr/bin/env node
/**
 * Pull live engagement stats for all three Apollo outreach sequences.
 *
 * Usage:
 *   node scripts/apollo-sequence-stats.mjs
 *   npm run prospects:stats
 *
 * Outputs a table per sequence showing:
 *   - Send/delivery/open/click/reply/bounce counts and rates
 *   - Contact status breakdown (active / finished / bounced / paused)
 *   - Total contacts enrolled
 *
 * No credits consumed — read-only API calls.
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ── Env ───────────────────────────────────────────────────────────────────────
function loadDotenvLocal() {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotenvLocal();

const API_KEY = process.env.APOLLO_API_KEY?.trim();
if (!API_KEY) {
  console.error("APOLLO_API_KEY not set. Add it to .env.local.");
  process.exit(1);
}

// ── Sequence registry ─────────────────────────────────────────────────────────
const SEQUENCES = [
  { name: "BG-A Platform-Reliability", id: process.env.APOLLO_SEQ_A ?? "6a0383f1425ef10015d169df" },
  { name: "BG-B Security-Governance",  id: process.env.APOLLO_SEQ_B ?? "6a0383dcfd6e1b001933d5ad" },
  { name: "BG-C DevOps-EngMgr",        id: process.env.APOLLO_SEQ_C ?? "6a0383caf0d797000dca8160" },
];

const H = { "Content-Type": "application/json", "x-api-key": API_KEY };

// ── Fetch total enrolled contacts (separate search endpoint) ──────────────────
async function fetchContactCount(seqId) {
  const r = await fetch("https://api.apollo.io/v1/contacts/search", {
    method: "POST",
    headers: H,
    body: JSON.stringify({ emailer_campaign_id: seqId, per_page: 1 }),
  });
  const d = await r.json();
  return d.pagination?.total_entries ?? "?";
}

// ── Formatting helpers ─────────────────────────────────────────────────────────
function pct(n) {
  if (n == null || n === 0) return "   0%";
  return `${(n * 100).toFixed(1).padStart(4)}%`;
}
function num(n) {
  return String(n ?? 0).padStart(4);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("\nApollo sequence stats");
console.log("======================");
console.log(`Fetched: ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })} (UK time)\n`);

for (const seq of SEQUENCES) {
  const r = await fetch(`https://api.apollo.io/v1/emailer_campaigns/${seq.id}`, { headers: H });
  const d = await r.json();
  const c = d.emailer_campaign;

  if (!c) {
    console.log(`${seq.name}: ⚠️  not found (id: ${seq.id})\n`);
    continue;
  }

  const totalEnrolled = await fetchContactCount(seq.id);
  const cs = c.contact_statuses ?? {};

  console.log(`┌─ ${seq.name} (${c.active ? "active ✓" : "INACTIVE ✗"})`);
  console.log(`│  Steps: ${c.num_steps ?? "?"}  |  Enrolled: ${totalEnrolled}`);
  console.log(`│`);
  console.log(`│  Contact status breakdown:`);
  console.log(`│    Active (in-sequence) : ${num(cs.active)}`);
  console.log(`│    Finished             : ${num(cs.finished)}`);
  console.log(`│    Paused               : ${num(cs.paused)}`);
  console.log(`│    Bounced              : ${num(cs.bounced)}  (hard: ${cs.hard_bounced ?? 0})`);
  console.log(`│    Spam blocked         : ${num(cs.spam_blocked)}`);
  console.log(`│`);
  console.log(`│  Email send/engagement:`);
  console.log(`│    Scheduled            : ${num(c.unique_scheduled)}`);
  console.log(`│    Delivered            : ${num(c.unique_delivered)}`);
  console.log(`│    Opened               : ${num(c.unique_opened)}  (${pct(c.open_rate)} open rate)`);
  console.log(`│    Clicked              : ${num(c.unique_clicked)}  (${pct(c.click_rate)})`);
  console.log(`│    Replied              : ${num(c.unique_replied)}  (${pct(c.reply_rate)})`);
  console.log(`│    Unsubscribed         : ${num(c.unique_unsubscribed)}`);
  console.log(`│    Bounce rate          : ${pct(c.bounce_rate)}`);
  console.log(`└─`);
  console.log("");
}

console.log("Re-run any time: npm run prospects:stats");
console.log("Reply tracking updates as Apollo processes incoming mail (may lag 5–30 min).\n");
