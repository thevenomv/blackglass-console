/**
 * scripts/apollo-prospect-search.mjs
 * Search Apollo for new SRE + CISO prospects, reveal emails, dedup against
 * existing CSV, and write a new prospects-YYYY-MM-DD.csv ready for enrolment.
 *
 * Usage:
 *   node scripts/apollo-prospect-search.mjs
 *   node scripts/apollo-prospect-search.mjs --max=50 --dry-run
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ── Config ────────────────────────────────────────────────────────────────────
const MAX_NEW   = 75;   // target number of new prospects to find
const DRY_RUN   = process.argv.includes("--dry-run");
const MAX_ARG   = process.argv.find(a => a.startsWith("--max="));
const MAX       = MAX_ARG ? parseInt(MAX_ARG.split("=")[1]) : MAX_NEW;

// ── Env ───────────────────────────────────────────────────────────────────────
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
const env = fs.readFileSync(envPath, "utf8").split("\n").reduce((o, l) => {
  const t = l.trim(); if (!t || t[0] === "#") return o;
  const i = t.indexOf("="); if (i > 0) o[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  return o;
}, {});
const KEY = env.APOLLO_API_KEY;
const h   = { "Content-Type": "application/json", "x-api-key": KEY };

// ── CSV row parser (handles quoted commas) ────────────────────────────────────
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

// ── Load existing prospects (dedup by email + apollo_id) ─────────────────────
const existingEmails = new Set();
const existingIds    = new Set();
const csvFiles = fs.readdirSync(".").filter(f => f.startsWith("prospects") && f.endsWith(".csv"));
for (const f of csvFiles) {
  fs.readFileSync(f, "utf8").split("\n").slice(1).forEach(line => {
    if (!line.trim()) return;
    const cols = parseCSVRow(line);
    if (cols[6]) existingEmails.add(cols[6].toLowerCase());
    if (cols[8]) existingIds.add(cols[8]);
  });
}
console.log(`Loaded ${existingEmails.size} existing emails to dedup against.\n`);

// ── Apollo search helper ──────────────────────────────────────────────────────
async function searchPeople(page, titleKeywords, personTitles) {
  const body = {
    page,
    per_page: 25,
    person_titles: personTitles,
    // SMB: 1–500 employees
    organization_num_employees_ranges: ["1,500"],
    // English-speaking markets (UK, US, CA, AU, IE)
    person_locations: ["United Kingdom", "United States", "Canada", "Australia", "Ireland"],
  };
  const r = await fetch("https://api.apollo.io/v1/mixed_people/api_search", {
    method: "POST", headers: h, body: JSON.stringify(body),
  });
  return r.json();
}

// ── Reveal email helper ───────────────────────────────────────────────────────
async function revealEmail(apolloId) {
  if (DRY_RUN) return null;
  const r = await fetch("https://api.apollo.io/v1/people/match", {
    method: "POST", headers: h,
    body: JSON.stringify({ id: apolloId, reveal_personal_emails: false }),
  });
  const d = await r.json();
  return d.person?.email ?? null;
}

// ── Search cohorts ────────────────────────────────────────────────────────────
const COHORTS = [
  {
    name: "SRE",
    seq: "BG-C DevOps-EngMgr",
    titles: [
      "Site Reliability Engineer",
      "SRE",
      "Platform Engineer",
      "DevOps Engineer",
      "Infrastructure Engineer",
    ],
  },
  {
    name: "CISO",
    seq: "BG-B Security-Governance",
    titles: [
      "Chief Information Security Officer",
      "CISO",
      "Head of Security",
      "VP Security",
      "Director of Security",
      "Information Security Manager",
    ],
  },
];

// ── Collect prospects ─────────────────────────────────────────────────────────
const newProspects = [];
const perCohort = Math.ceil(MAX / COHORTS.length);

for (const cohort of COHORTS) {
  console.log(`\nSearching ${cohort.name} (target: ${perCohort})...`);
  let page = 1;
  let found = 0;

  while (found < perCohort && page <= 8) {
    const data = await searchPeople(page, cohort.name, cohort.titles);
    const people = data.people ?? data.contacts ?? [];
    if (!people.length) { console.log(`  No more results at page ${page}`); break; }

    for (const p of people) {
      if (found >= perCohort) break;
      if (existingIds.has(p.id)) continue;

      const emailRaw = p.email ?? "";
      if (existingEmails.has(emailRaw.toLowerCase())) continue;

      // api_search returns has_email:true but email is not populated — always reveal
      let email = (emailRaw && !emailRaw.includes("*")) ? emailRaw : null;

      if (!email && p.has_email) {
        // Reveal — costs 1 credit
        email = await revealEmail(p.id);
        if (email) console.log(`  Revealed: ${p.first_name} ${p.last_name_obfuscated} → ${email}`);
      }

      if (!email) continue;

      existingEmails.add(email.toLowerCase());
      existingIds.add(p.id);

      newProspects.push({
        first_name:           p.first_name ?? "",
        last_name:            p.last_name ?? p.last_name_obfuscated ?? "",
        title:                p.title      ?? "",
        company:              p.organization?.name ?? "",
        company_size:         p.organization?.estimated_num_employees ?? "",
        location:             p.city ? `${p.city}, ${p.country}` : (p.country ?? ""),
        email,
        linkedin_url:         p.linkedin_url ?? "",
        apollo_id:            p.id,
        recommended_sequence: cohort.seq,
      });
      found++;
    }

    console.log(`  Page ${page}: ${people.length} results, ${found}/${perCohort} collected`);
    page++;

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 300));
  }
}

console.log(`\nTotal new prospects found: ${newProspects.length}`);

if (newProspects.length === 0) {
  console.log("Nothing to write.");
  process.exit(0);
}

// ── Write CSV ─────────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const outFile = `prospects-new-${today}.csv`;
const header = "first_name,last_name,title,company,company_size,location,email,linkedin_url,apollo_id,recommended_sequence";
const rows = newProspects.map(p =>
  [p.first_name, p.last_name, p.title, p.company, p.company_size, p.location,
   p.email, p.linkedin_url, p.apollo_id, p.recommended_sequence]
    .map(v => `"${String(v).replace(/"/g, '""')}"`)
    .join(",")
);
fs.writeFileSync(outFile, [header, ...rows].join("\n"));
console.log(`\nWritten: ${outFile} (${newProspects.length} prospects)`);

if (DRY_RUN) {
  console.log("\n[DRY RUN] No emails revealed. Re-run without --dry-run to reveal and save.");
} else {
  console.log(`\nTo enrol, run:`);
  console.log(`  node scripts/apollo-enrol-sequences.mjs --csv=${outFile} --enrol-only --seq-b=6a0383dcfd6e1b001933d5ad --seq-c=6a0383f1425ef10015d169df`);
}
