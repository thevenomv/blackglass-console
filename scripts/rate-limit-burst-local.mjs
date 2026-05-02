#!/usr/bin/env node
/**
 * Smoke POST /api/v1/scans from one process until 429 (default cap 80).
 * Helps validate in-memory buckets without k6 installed.
 *
 *   BASE_URL=http://127.0.0.1:3100 node scripts/rate-limit-burst-local.mjs
 */
const base = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const cap = Number(process.env.BURST_LIMIT ?? "80");

let denied = false;
for (let i = 0; i < cap; i++) {
  const res = await fetch(`${base}/api/v1/scans`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ host_ids: [] }),
  });
  if (res.status === 429) {
    console.log(JSON.stringify({ stopAt: i + 1, status: res.status }));
    denied = true;
    break;
  }
  if (!res.ok) {
    console.error("Unexpected:", res.status, await res.text());
    process.exit(1);
  }
}
if (!denied) console.log(JSON.stringify({ ok: true, attempted: cap, note: "no 429 before cap" }));
