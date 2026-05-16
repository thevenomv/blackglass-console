#!/usr/bin/env node
/**
 * Reveal emails for curated prospects and enrol them in Apollo sequences.
 *
 * USAGE
 *   node scripts/apollo-enrol-sequences.mjs --csv=.local/prospects/prospects-combined-2026-05-12.csv
 *   node scripts/apollo-enrol-sequences.mjs --csv=.local/prospects/prospects-combined-2026-05-12.csv --reveal-only
 *   node scripts/apollo-enrol-sequences.mjs --csv=.local/prospects/prospects-combined-2026-05-12.csv --enrol-only
 *
 * OPTIONS
 *   --csv=FILE        Input CSV (must have apollo_id + recommended_sequence columns)
 *   --reveal-only     Only reveal emails, write updated CSV, do not enrol
 *   --enrol-only      Skip reveal step (assumes emails already in CSV), go straight to enrol
 *   --dry-run         Print what would happen, spend nothing
 *   --yes             Skip the interactive confirmation prompt (for scripted/CI use)
 *
 * SEQUENCE MAP (edit to match your Apollo sequence IDs after creating them in Apollo UI)
 *   BG-A Platform-Reliability  → SEQUENCE_ID_A
 *   BG-B Security-Governance   → SEQUENCE_ID_B
 *   BG-C DevOps-EngMgr         → SEQUENCE_ID_C
 *
 * HOW TO FIND YOUR SEQUENCE IDS
 *   In Apollo: Sequences → open a sequence → copy the ID from the URL:
 *   https://app.apollo.io/#/sequences/XXXXXXXX  ← that's the ID
 *
 * ENV
 *   APOLLO_API_KEY   — required
 */

import process from "node:process";
import fs from "node:fs";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Env — parse .env.local directly (no dotenv dependency at runtime)
// ---------------------------------------------------------------------------
function loadDotenvLocal() {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
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
  console.error("APOLLO_API_KEY is not set. Add it to .env.local.");
  process.exit(1);
}

// Email account to send sequences from (jamie@obsidiandynamics.co.uk).
// Set APOLLO_EMAIL_ACCOUNT_ID in .env.local to override.
const EMAIL_ACCOUNT_ID = (process.env.APOLLO_EMAIL_ACCOUNT_ID ?? "6a036a25ee2332000d4d4abc").trim();

// ---------------------------------------------------------------------------
// ⚠️  SET THESE AFTER CREATING YOUR SEQUENCES IN APOLLO UI
//     Sequences → New Sequence → copy ID from URL
// ---------------------------------------------------------------------------
const SEQUENCE_IDS = {
  "BG-A Platform-Reliability": process.env.APOLLO_SEQ_A ?? "",
  "BG-B Security-Governance":  process.env.APOLLO_SEQ_B ?? "",
  "BG-C DevOps-EngMgr":        process.env.APOLLO_SEQ_C ?? "",
};

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : fallback;
}
function flag(name) { return process.argv.includes(`--${name}`); }

const csvFile    = arg("csv", ".local/prospects/prospects-combined-2026-05-12.csv");
const revealOnly = flag("reveal-only");
const enrolOnly  = flag("enrol-only");
const dryRun     = flag("dry-run");
const autoYes    = flag("yes");

// CLI flags override env vars (workaround for env loading issues)
if (arg("seq-a", "")) SEQUENCE_IDS["BG-A Platform-Reliability"] = arg("seq-a", "");
if (arg("seq-b", "")) SEQUENCE_IDS["BG-B Security-Governance"]  = arg("seq-b", "");
if (arg("seq-c", "")) SEQUENCE_IDS["BG-C DevOps-EngMgr"]        = arg("seq-c", "");

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------
function parseCSV(raw) {
  const [headerLine, ...rows] = raw.trim().split("\n");
  const headers = parseCSVRow(headerLine).map((h) => h.trim());

  return rows.filter(r => r.trim()).map((row) => {
    const vals = parseCSVRow(row);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? "").trim()]));
  });
}

function parseCSVRow(line) {
  const result = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function serializeCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => `"${(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim().toLowerCase()); }));
}

// ---------------------------------------------------------------------------
// Apollo API helpers
// ---------------------------------------------------------------------------
async function apolloPost(path, body) {
  const res = await fetch(`https://api.apollo.io/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** Reveal a single contact's email by apollo_id. Costs 1 credit. */
async function revealEmail(apolloId) {
  const { ok, data } = await apolloPost("/people/match", {
    id: apolloId,
    reveal_personal_emails: false,
    reveal_phone_number: false,
  });
  if (ok && data.person?.email) return data.person.email;
  // Fallback: try enrichment endpoint
  const r2 = await apolloPost("/people/bulk_match", { details: [{ id: apolloId }] });
  return r2.data?.matches?.[0]?.email ?? null;
}

/** Create (or find existing) CRM contact from CSV row, return Apollo contact ID. */
async function upsertContact(contact) {
  const { ok, data } = await apolloPost("/contacts", {
    first_name: contact.first_name,
    last_name:  contact.last_name,
    email:      contact.email,
    organization_name: contact.company,
    title:      contact.title,
  });
  return ok ? (data?.contact?.id ?? null) : null;
}

/** Enrol a CRM contact ID in an Apollo sequence. */
async function enrolInSequence(contactId, sequenceId) {
  const { ok, status, data } = await apolloPost(`/emailer_campaigns/${sequenceId}/add_contact_ids`, {
    emailer_campaign_id: sequenceId,
    contact_ids: [contactId],
    send_email_from_email_account_id: EMAIL_ACCOUNT_ID,
  });
  return { ok, status, error: data?.error_message ?? data?.error ?? data?.message ?? JSON.stringify(data) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
if (!fs.existsSync(csvFile)) {
  console.error(`CSV not found: ${csvFile}`);
  process.exit(1);
}

const contacts = parseCSV(fs.readFileSync(csvFile, "utf8"));
console.log(`\nApollo sequence enrolment`);
console.log(`=========================`);
console.log(`CSV       : ${csvFile}`);
console.log(`Contacts  : ${contacts.length}`);
console.log(`Dry run   : ${dryRun ? "YES — nothing will be spent or sent" : "NO"}`);
console.log("");

// ── Step 1: Reveal emails ──────────────────────────────────────────────────
if (!enrolOnly) {
  const needReveal = contacts.filter((c) => !c.email);
  if (needReveal.length === 0) {
    console.log("✓ All contacts already have emails — skipping reveal step.\n");
  } else {
    console.log(`Reveal step: ${needReveal.length} contacts need email reveal (${needReveal.length} credit${needReveal.length !== 1 ? "s" : ""}).\n`);
    needReveal.forEach((c, i) => console.log(`  ${i + 1}. ${c.first_name} ${c.last_name} — ${c.title} @ ${c.company}`));
    console.log("");

    if (dryRun) {
      console.log("[DRY RUN] Would reveal emails for the above contacts.");
    } else {
      const answer = await prompt(`Spend ${needReveal.length} Apollo credit${needReveal.length !== 1 ? "s" : ""} to reveal emails? (yes/no): `);
      if (answer !== "yes") {
        console.log("Aborted.");
        process.exit(0);
      }

      let revealed = 0;
      for (const contact of needReveal) {
        process.stdout.write(`  Revealing ${contact.first_name} ${contact.last_name} (${contact.company}) ... `);
        const email = await revealEmail(contact.apollo_id);
        if (email) {
          contact.email = email;
          revealed++;
          console.log(`✓ ${email}`);
        } else {
          console.log(`✗ not found`);
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      // Write updated CSV with emails filled in
      const updatedCsv = serializeCSV(contacts);
      fs.writeFileSync(csvFile, updatedCsv);
      console.log(`\n✓ ${revealed}/${needReveal.length} emails revealed. CSV updated: ${csvFile}\n`);
    }
  }
  if (revealOnly) process.exit(0);
}

// ── Step 2: Enrol in sequences ─────────────────────────────────────────────
console.log("Enrol step");
console.log("----------");

// Check sequence IDs are configured
const missingSeqs = contacts
  .map((c) => c.recommended_sequence)
  .filter((s, i, a) => a.indexOf(s) === i)
  .filter((s) => !SEQUENCE_IDS[s]);

if (missingSeqs.length > 0) {
  console.log("\n⚠️  Sequence IDs not configured for:");
  missingSeqs.forEach((s) => console.log(`   ${s}  →  set APOLLO_SEQ_A / APOLLO_SEQ_B / APOLLO_SEQ_C in .env.local`));
  console.log("\nHow to get sequence IDs:");
  console.log("  1. Apollo UI → Sequences → create BG-A, BG-B, BG-C sequences");
  console.log("  2. Open each sequence → copy the ID from the URL");
  console.log("     https://app.apollo.io/#/sequences/<ID>");
  console.log("  3. Add to .env.local:");
  console.log("     APOLLO_SEQ_A=<id-for-BG-A>");
  console.log("     APOLLO_SEQ_B=<id-for-BG-B>");
  console.log("     APOLLO_SEQ_C=<id-for-BG-C>");
  console.log("\nRe-run once IDs are set.");
  process.exit(1);
}

const toEnrol = contacts.filter((c) => c.email && SEQUENCE_IDS[c.recommended_sequence]);
const noEmail = contacts.filter((c) => !c.email);

if (noEmail.length > 0) {
  console.log(`⚠️  ${noEmail.length} contact(s) have no email and will be skipped:`);
  noEmail.forEach((c) => console.log(`   ${c.first_name} ${c.last_name} @ ${c.company}`));
  console.log("");
}

console.log(`Ready to enrol ${toEnrol.length} contacts:\n`);
toEnrol.forEach((c, i) =>
  console.log(`  ${i + 1}. ${c.first_name} ${c.last_name} — ${c.title} @ ${c.company}  →  ${c.recommended_sequence}`),
);
console.log("");

if (dryRun) {
  console.log("[DRY RUN] Would enrol the above contacts into their sequences.");
  process.exit(0);
}

const confirm = autoYes ? "yes" : await prompt(`Enrol ${toEnrol.length} contacts in Apollo sequences? (yes/no): `);
if (confirm !== "yes") {
  console.log("Aborted.");
  process.exit(0);
}

console.log("");
let enrolled = 0;
let failed = 0;
for (const contact of toEnrol) {
  const seqId = SEQUENCE_IDS[contact.recommended_sequence];
  process.stdout.write(`  ${contact.first_name} ${contact.last_name} → ${contact.recommended_sequence} ... `);
  // Step 1: create/upsert CRM contact
  const contactId = await upsertContact(contact);
  if (!contactId) {
    console.log("✗ failed (could not create CRM contact)");
    failed++;
    await new Promise((r) => setTimeout(r, 400));
    continue;
  }
  // Step 2: enrol in sequence
  const { ok, status, error } = await enrolInSequence(contactId, seqId);
  if (ok) {
    console.log("✓ enrolled");
    enrolled++;
  } else {
    console.log(`✗ failed (${status}${error ? ": " + error : ""})`);
    failed++;
  }
  await new Promise((r) => setTimeout(r, 400));
}

console.log(`\n${enrolled} enrolled, ${failed} failed.`);
if (enrolled > 0) {
  console.log("\nNext: check Apollo → Sequences to confirm contacts are active.");
  console.log("Apollo will send step 1 from your connected mailbox on the schedule you set.");
}
