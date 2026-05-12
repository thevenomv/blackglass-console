#!/usr/bin/env node
/**
 * Minimal example: GET /api/v1/hosts with a tenant API key.
 *
 *   BLACKGLASS_API_TOKEN=bg_live_… node examples/api/list-hosts.mjs
 *   BLACKGLASS_API_BASE_URL=https://staging.example node examples/api/list-hosts.mjs
 */
const base = (process.env.BLACKGLASS_API_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const token = process.env.BLACKGLASS_API_TOKEN?.trim();

if (!token) {
  console.error("Set BLACKGLASS_API_TOKEN to a console-issued API key (bg_live_…).");
  process.exit(2);
}

const url = `${base}/api/v1/hosts?limit=20`;
const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  },
});

const text = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText}\n${text}`);
  process.exit(1);
}

try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
