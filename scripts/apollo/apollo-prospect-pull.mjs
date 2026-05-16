#!/usr/bin/env node
/**
 * @deprecated Use apollo-prospect-search.mjs instead.
 *
 * apollo-prospect-pull.mjs is retained for reference only. Its search
 * queries and persona-mapping have been superseded by apollo-prospect-search.mjs,
 * which supports all three ICP cohorts (BG-A/B/C), handles quoted-comma CSV
 * output correctly, and shares the same native env-loader pattern.
 *
 * npm run prospects:search  ← replaces this script
 */

/**
 * Pull a shortlist of ICP-matched prospects from Apollo.io and write them
 * to a CSV for human review. Does NOT enrol anyone in sequences or send
 * any emails.
 *
 * Basic-plan limits (as of May 2026):
 *   - 2,500 credits / month  — 1 credit per revealed email
 *   - Hard script cap: --reveal limited to 50 contacts per run (see CREDIT SAFETY)
 *   - Database search via API is included; no credits consumed for search.
 *
 * USAGE
 *   node scripts/apollo-prospect-pull.mjs
 *   node scripts/apollo-prospect-pull.mjs --persona=A --limit=25 --out=prospects-a.csv
 *   node scripts/apollo-prospect-pull.mjs --persona=B --limit=25 --reveal
 *
 * OPTIONS
 *   --persona=A|B|C     Which ICP persona to pull (default: A)
 *                         A = Platform / reliability (SRE, Head of Platform, Infra)
 *                         B = Security / governance (Security Eng, CISO, IT Dir)
 *                         C = DevOps / Engineering Manager
 *   --limit=N           Max contacts to fetch (default: 25, hard max: 50 per run)
 *   --reveal            Spend 1 Apollo credit per contact to get verified emails.
 *                       OMIT THIS FLAG to preview contacts without spending credits.
 *                       Capped at 50 per run. Asks for confirmation before any spend.
 *   --out=FILE          Output CSV filename (default: prospects-<persona>-<date>.csv)
 *   --page=N            Start at page N (1-based, default 1) — for resuming or
 *                       paging past already-pulled contacts
 *
 * ENV
 *   APOLLO_API_KEY      — required. Add to .env.local or Doppler under APOLLO_API_KEY.
 *
 * OUTPUT CSV columns:
 *   first_name, last_name, title, company, company_size, location, email,
 *   linkedin_url, apollo_id
 *
 * CREDIT SAFETY
 *   Without --reveal: zero credits spent (search only).
 *   With --reveal:    1 credit per contact; hard cap of 50 per run enforced by the
 *                     script. Confirmation required before spending ANY credits.
 *                     For >10 contacts a second explicit "yes" is required.
 *   Monthly budget:   2,500 credits. At 25/run across 3 personas = 75 credits.
 *                     That leaves 2,425 credits/month in reserve.
 */

import process from "node:process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import readline from "node:readline";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : fallback;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const MONTHLY_CREDIT_BUDGET = 2500;
const REVEAL_HARD_CAP = 50; // never reveal more than this per run

const persona = (arg("persona", "A") || "A").toUpperCase();
const limit = Math.min(parseInt(arg("limit", "25"), 10) || 25, REVEAL_HARD_CAP);
const page = Math.max(parseInt(arg("page", "1"), 10) || 1, 1);
const reveal = flag("reveal");
const dateStamp = new Date().toISOString().slice(0, 10);
const outFile = arg("out", `prospects-${persona.toLowerCase()}-${dateStamp}.csv`);

// ---------------------------------------------------------------------------
// Load API key
// ---------------------------------------------------------------------------
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

const APOLLO_KEY = process.env.APOLLO_API_KEY?.trim();
if (!APOLLO_KEY) {
  console.error(
    "APOLLO_API_KEY is not set.\n" +
    "Add it to .env.local or run: doppler run -- node scripts/apollo-prospect-pull.mjs",
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// ICP persona definitions
// Free-plan basic filters: person_titles, organization_num_employees_ranges,
// person_locations (city / country). Technology filters require paid plan.
// ---------------------------------------------------------------------------
const PERSONAS = {
  A: {
    label: "Platform / Reliability (SRE, Head of Platform, Infra Lead)",
    person_titles: [
      "Platform Engineer",
      "Site Reliability Engineer",
      "SRE",
      "Head of Platform",
      "Director of Infrastructure",
      "Infrastructure Engineer",
      "VP of Infrastructure",
      "VP Infrastructure",
    ],
    sequence_recommendation: "BG-A Platform-Reliability",
  },
  B: {
    label: "Security / Governance (Security Eng, CISO, IT Director)",
    person_titles: [
      "Security Engineer",
      "Information Security Engineer",
      "Director of Security",
      "Head of Security",
      "CISO",
      "Chief Information Security Officer",
      "IT Director",
      "IT Manager",
    ],
    sequence_recommendation: "BG-B Security-Governance",
  },
  C: {
    label: "DevOps / Engineering Manager",
    person_titles: [
      "DevOps Engineer",
      "DevOps Lead",
      "Engineering Manager",
      "VP of Engineering",
      "VP Engineering",
      "Director of Engineering",
    ],
    sequence_recommendation: "BG-C DevOps-EngMgr",
  },
};

const personaDef = PERSONAS[persona];
if (!personaDef) {
  console.error(`Unknown persona "${persona}". Use A, B, or C.`);
  process.exit(2);
}

// Headcount ranges matching ICP (30-200, secondary 200-500)
const HEADCOUNT_RANGES = ["1,20", "21,50", "51,100", "101,200"];

// ---------------------------------------------------------------------------
// Apollo API helpers
// ---------------------------------------------------------------------------
const APOLLO_BASE = "https://api.apollo.io/v1";

async function apolloPost(path, body) {
  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": APOLLO_KEY,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    console.error("Apollo API returned 401 — check APOLLO_API_KEY.");
    process.exit(1);
  }
  // Caller handles 403 (plan restriction) — throw so caller can fallback
  if (res.status === 403) {
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(errBody.error ?? "403 Forbidden");
    err.status = 403;
    throw err;
  }
  if (res.status === 422) {
    const text = await res.text();
    console.error("Apollo API 422 (check filter values):", text);
    process.exit(1);
  }
  if (!res.ok) {
    const text = await res.text();
    console.error(`Apollo API ${res.status}:`, text);
    process.exit(1);
  }

  return res.json();
}

// Search the full Apollo database — requires Basic plan ($49/mo) or higher.
async function searchPeople(titles, page, perPage) {
  return apolloPost("/mixed_people/api_search", {
    page,
    per_page: perPage,
    person_titles: titles,
    organization_num_employees_ranges: HEADCOUNT_RANGES,
  });
}

// Pull saved contacts from this Apollo account — works on free plan.
// Filters by title keywords client-side.
async function searchSavedContacts(titleKeywords, page, perPage) {
  return apolloPost("/contacts/search", {
    page,
    per_page: Math.min(perPage, 100),
  });
}

// Reveal a contact's email — costs 1 Apollo credit
async function revealEmail(apolloPersonId) {
  return apolloPost("/people/match", {
    id: apolloPersonId,
    reveal_personal_emails: false, // personal emails cost more credits
    reveal_phone_number: false,
  });
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------
function csvEscape(val) {
  if (val == null) return "";
  const s = String(val).trim();
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const CSV_HEADERS = [
  "first_name",
  "last_name",
  "title",
  "company",
  "company_size",
  "location",
  "email",
  "linkedin_url",
  "apollo_id",
  "recommended_sequence",
];

function personToRow(p, sequence) {
  // Handles both /mixed_people/api_search (p.organization.name) and
  // /contacts/search (p.organization_name) response shapes.
  const company = p.organization?.name ?? p.organization_name ?? p.employment_history?.[0]?.organization_name ?? "";
  const size = p.organization?.estimated_num_employees ?? p.account?.estimated_num_employees ?? "";
  const location = [p.city, p.state, p.country].filter(Boolean).join(", ");
  return CSV_HEADERS.map((h) => {
    switch (h) {
      case "first_name": return csvEscape(p.first_name);
      case "last_name": return csvEscape(p.last_name ?? p.last_name_obfuscated);
      case "title": return csvEscape(p.title);
      case "company": return csvEscape(company);
      case "company_size": return csvEscape(size);
      case "location": return csvEscape(location);
      case "email": return csvEscape(p.email ?? "");
      case "linkedin_url": return csvEscape(p.linkedin_url ?? "");
      case "apollo_id": return csvEscape(p.id);
      case "recommended_sequence": return csvEscape(sequence);
      default: return "";
    }
  }).join(",");
}

// ---------------------------------------------------------------------------
// Confirm helper for credit spend
// ---------------------------------------------------------------------------
async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log("\nBlackglass — Apollo prospect pull");
console.log("==================================");
console.log(`Persona : ${persona} — ${personaDef.label}`);
console.log(`Limit   : ${limit} contacts (page ${page})`);
console.log(`Reveal  : ${reveal ? "YES — emails will be revealed (1 credit each)" : "NO — preview only, no credits spent"}`);
console.log(`Output  : ${outFile}`);
console.log("");

// Search — try full database first; fall back to saved contacts on free plan
process.stdout.write("Searching Apollo... ");
let people = [];
let totalAvailable = "?";
let usingSavedContacts = false;

try {
  const searchResult = await searchPeople(personaDef.person_titles, page, limit);
  people = searchResult.people ?? [];
  totalAvailable = searchResult.pagination?.total_entries ?? "?";
  console.log(`found ${people.length} contacts (${totalAvailable} total in Apollo database)\n`);
} catch (err) {
  if (err.status === 403) {
    usingSavedContacts = true;
    console.log("database search requires paid plan — falling back to saved contacts.\n");
    console.log("NOTE: Showing contacts already saved in your Apollo account.");
    console.log("      To search the full Apollo database, upgrade to Basic ($49/mo).");
    console.log("      Free-plan web UI workaround: app.apollo.io → People → search → Save to List → Export CSV\n");
    const savedResult = await searchSavedContacts(personaDef.person_titles, page, 100);
    const allSaved = savedResult.contacts ?? [];
    // Client-side filter by title keywords for this persona
    const keywords = personaDef.person_titles.map((t) => t.toLowerCase());
    people = allSaved.filter((c) => {
      const t = (c.title ?? "").toLowerCase();
      return keywords.some((k) => t.includes(k.split(" ")[0]));
    });
    // If keyword filter is too tight, include all saved contacts
    if (people.length === 0) people = allSaved;
    people = people.slice(0, limit);
    totalAvailable = allSaved.length;
    console.log(`Found ${people.length} matching saved contacts (${allSaved.length} total in your account).\n`);
  } else {
    throw err;
  }
}

if (people.length === 0) {
  if (usingSavedContacts) {
    console.log("No saved contacts in your Apollo account yet.");
    console.log("Add contacts via the web UI: app.apollo.io → People → search → Save to List");
  } else {
    console.log("No results. Try adjusting --persona or check your API key permissions.");
  }
  process.exit(0);
}

// Print preview table
console.log("Preview (no emails revealed yet):");
console.log("-".repeat(90));
const COL = { name: 28, title: 30, company: 22, location: 18 };
const header =
  "  #  " +
  "Name".padEnd(COL.name) +
  "Title".padEnd(COL.title) +
  "Company".padEnd(COL.company) +
  "Location";
console.log(header);
console.log("-".repeat(90));

people.forEach((p, i) => {
  const name = `${p.first_name ?? ""} ${p.last_name ?? p.last_name_obfuscated ?? ""}`.trim().slice(0, COL.name - 1);
  const title = (p.title ?? "").slice(0, COL.title - 1);
  const company = (p.organization?.name ?? p.employment_history?.[0]?.organization_name ?? "").slice(0, COL.company - 1);
  const location = [p.city, p.country].filter(Boolean).join(", ").slice(0, COL.location - 1);
  console.log(
    `  ${String(i + 1).padStart(2)}  ` +
    name.padEnd(COL.name) +
    title.padEnd(COL.title) +
    company.padEnd(COL.company) +
    location,
  );
});
console.log("-".repeat(90));
console.log(`\n${people.length} contacts found.\n`);

// Optional email reveal
let enrichedPeople = people.map((p) => ({ ...p }));

if (reveal) {
  const creditCost = Math.min(people.length, REVEAL_HARD_CAP);
  const remaining = MONTHLY_CREDIT_BUDGET - creditCost;
  console.log(`⚠  CREDIT SPEND SUMMARY`);
  console.log(`   This reveal : ${creditCost} credits`);
  console.log(`   Monthly budget : ${MONTHLY_CREDIT_BUDGET} credits`);
  console.log(`   Remaining after this run : ~${remaining} credits (estimate — does not account for prior spend this month)`);
  console.log(`   Check exact balance at: app.apollo.io → Settings → Credits\n`);

  // Always require confirmation before spending anything
  const firstOk = await confirm(`Confirm: reveal emails for ${creditCost} contact${creditCost !== 1 ? "s" : ""} and spend ${creditCost} credit${creditCost !== 1 ? "s" : ""}?`);
  if (!firstOk) {
    console.log("Cancelled. CSV will be saved without emails.");
  }

  // Second confirmation for larger batches
  const shouldReveal = firstOk && (creditCost > 10
    ? await confirm(`Second confirmation required for ${creditCost} credits. Are you sure?`)
    : true);

  if (!shouldReveal) {
    console.log("Skipping email reveal. CSV will be saved without emails.");
  } else {
    console.log(`Revealing emails (${creditCost} credits)...`);
    let revealed = 0;
    for (let i = 0; i < enrichedPeople.length; i++) {
      const p = enrichedPeople[i];
      // Skip if email already populated from search (free plan sometimes returns it)
      if (p.email) {
        process.stdout.write(`  [${i + 1}/${people.length}] ${p.first_name} ${p.last_name} — already have email\n`);
        continue;
      }
      try {
        const match = await revealEmail(p.id);
        const emailFromMatch = match.person?.email;
        if (emailFromMatch) {
          enrichedPeople[i] = { ...p, email: emailFromMatch };
          revealed++;
          process.stdout.write(`  [${i + 1}/${people.length}] ${p.first_name} ${p.last_name} — ✓ got email\n`);
        } else {
          process.stdout.write(`  [${i + 1}/${people.length}] ${p.first_name} ${p.last_name} — no email available\n`);
        }
        // Apollo rate limit: free plan is throttled. Small delay between reveals.
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.warn(`  [${i + 1}] Error revealing ${p.id}:`, err.message);
      }
    }
    console.log(`\nRevealed ${revealed} emails (${creditCost - revealed} not available).\n`);
  }
}

// Write CSV
const csvLines = [CSV_HEADERS.join(",")];
for (const p of enrichedPeople) {
  csvLines.push(personToRow(p, personaDef.sequence_recommendation));
}
fs.writeFileSync(outFile, csvLines.join("\n"), "utf8");

const emailCount = enrichedPeople.filter((p) => p.email).length;
console.log(`CSV saved: ${outFile}`);
console.log(`  Total rows : ${enrichedPeople.length}`);
console.log(`  With email : ${emailCount}`);
console.log(`  No email   : ${enrichedPeople.length - emailCount}`);
console.log("");
console.log("Next steps:");
console.log("  1. Open the CSV and review — remove anyone who is not a good fit.");
console.log(`  2. In Apollo, go to Sequences → '${personaDef.sequence_recommendation}'.`);
console.log("  3. Import the CSV (People → Import CSV → Add to Sequence).");
console.log("  4. Apollo will enrol and send on the schedule you configured.");
console.log("  5. If you have not created that sequence yet, see:");
console.log("     docs/sales/apollo-cold-email-sequences.md  (Apollo setup guide section)");
console.log("");
