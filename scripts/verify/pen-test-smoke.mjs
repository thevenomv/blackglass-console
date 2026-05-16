#!/usr/bin/env node
/**
 * Prints curl snippets for quick manual pen-test passes against a local or staging BASE_URL.
 * Does not run exploits — use with consent on systems you own.
 */
import process from "node:process";

const base = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

const snippets = [
  `# Health`,
  `curl -sS "${base}/api/health" | jq .`,
  ``,
  `# Drift page (cursor pagination)`,
  `curl -sS "${base}/api/v1/drift?limit=5" | jq '{total, next_cursor, count: (.items|length)}'`,
  ``,
  `# Audit tail with filters`,
  `curl -sS "${base}/api/v1/audit/events?limit=10&action=scan" | jq '.items|length'`,
  ``,
  `# Demo CTA probe`,
  `curl -sS "${base}/api/saas/demo-cta" | jq .`,
  ``,
  `# Ingest without auth (expect 401)`,
  `curl -sS -o /dev/null -w "%{http_code}\\n" -X POST "${base}/api/v1/ingest" -H "Content-Type: application/json" -d "{}"`,
  ``,
  `# Scan with empty body`,
  `curl -sS -o /dev/null -w "%{http_code}\\n" -X POST "${base}/api/v1/scans" -H "Content-Type: application/json" -d "{}"`,
];

console.log(snippets.join("\n"));
