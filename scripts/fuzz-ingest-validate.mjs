#!/usr/bin/env node
/**
 * Minimal shape checks for push-ingest-style payloads (offline).
 * Run: node scripts/fuzz-ingest-validate.mjs
 */

function looksLikeIngest(o) {
  if (o === null || typeof o !== "object" || Array.isArray(o)) return { ok: false, reason: "not_object" };
  if (typeof o.host_id !== "string" || !o.host_id.trim()) return { ok: false, reason: "host_id" };
  if (o.findings !== undefined && !Array.isArray(o.findings)) return { ok: false, reason: "findings" };
  return { ok: true };
}

const cases = [
  { body: {}, expectOk: false },
  { body: { host_id: 1 }, expectOk: false },
  { body: { host_id: "" }, expectOk: false },
  { body: { host_id: "host-01", findings: "nope" }, expectOk: false },
  { body: { host_id: "host-01", findings: [] }, expectOk: true },
  {
    body: { host_id: "host-01", collected_at: new Date().toISOString(), findings: [{ id: "x" }] },
    expectOk: true,
  },
];

let bad = 0;
for (const { body, expectOk } of cases) {
  const r = looksLikeIngest(body);
  const ok = r.ok === expectOk;
  if (!ok) {
    console.error("case mismatch", { body, expectOk, r });
    bad++;
  }
}

if (bad) process.exit(1);
console.log(`fuzz-ingest-validate: ${cases.length} case(s) passed`);
