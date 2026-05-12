#!/usr/bin/env node
/**
 * Lists Resend domain verification status (no secrets printed).
 * For CI: set RESEND_API_KEY in secrets; optional GITHUB_STEP_SUMMARY.
 *
 *   RESEND_API_KEY=re_... node scripts/resend-domain-status.mjs
 */
import fs from "node:fs";

const key = process.env.RESEND_API_KEY?.trim();
if (!key) {
  console.error("RESEND_API_KEY is not set.");
  process.exit(2);
}

const r = await fetch("https://api.resend.com/domains", {
  headers: { Authorization: `Bearer ${key}` },
});
const body = await r.json().catch(() => ({}));
if (!r.ok) {
  console.error(`Resend domains API ${r.status}:`, JSON.stringify(body));
  process.exit(1);
}

const rows = Array.isArray(body.data) ? body.data : [];
const lines = [];
lines.push("## Resend domains");
lines.push("");
lines.push("| Domain | Status |");
lines.push("|--------|--------|");
for (const d of rows) {
  const name = d.name ?? d.domain ?? "?";
  const status = d.status ?? "?";
  lines.push(`| ${name} | ${status} |`);
}
if (!rows.length) lines.push("| *(none)* | — |");
lines.push("");

const verified = rows.filter((d) => String(d.status).toLowerCase() === "verified");
const hasBlackglass = verified.some((d) => String(d.name ?? d.domain ?? "").includes("blackglasssec.com"));

if (!hasBlackglass) {
  lines.push(
    "> **Note:** No **verified** domain matching `blackglasssec.com` was found. " +
      "Product `noreply@blackglasssec.com` sends may fail until DNS verification completes in Resend.",
  );
  lines.push("");
}

const out = lines.join("\n");
console.log(out);

const sum = process.env.GITHUB_STEP_SUMMARY;
if (sum) fs.appendFileSync(sum, out + "\n");
