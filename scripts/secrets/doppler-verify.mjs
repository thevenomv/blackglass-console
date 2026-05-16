#!/usr/bin/env node
/**
 * Smoke-check Doppler API credentials (same download endpoint as the app).
 * Does not print secret values.
 *
 * Usage (pick one):
 *   set DOPPLER_TOKEN / DOPPLER_PROJECT / DOPPLER_CONFIG in your shell, then:
 *     node scripts/doppler-verify.mjs
 *
 *   or with a local env file (Node 22+):
 *     node --env-file=.env.local scripts/doppler-verify.mjs
 */

const token = process.env.DOPPLER_TOKEN?.trim();
const project = process.env.DOPPLER_PROJECT?.trim();
const config = process.env.DOPPLER_CONFIG?.trim();
const secretKey =
  process.env.BLACKGLASS_SSH_SECRET_NAME?.trim() || "SSH_PRIVATE_KEY";

if (!token || !project || !config) {
  console.error(
    "Missing DOPPLER_TOKEN, DOPPLER_PROJECT, and/or DOPPLER_CONFIG.",
  );
  console.error(
    "Set them in the environment or use: node --env-file=.env.local scripts/doppler-verify.mjs",
  );
  process.exit(1);
}

const url = new URL(
  "https://api.doppler.com/v3/configs/config/secrets/download",
);
url.searchParams.set("format", "json");
url.searchParams.set("project", project);
url.searchParams.set("config", config);

const res = await fetch(url, {
  headers: {
    accept: "application/json",
    authorization: `Bearer ${token}`,
  },
});

const text = await res.text();
let body;
try {
  body = text ? JSON.parse(text) : {};
} catch {
  console.error(`Doppler returned non-JSON (HTTP ${res.status})`);
  process.exit(1);
}

if (!res.ok) {
  const msg =
    (body && typeof body === "object" && body.messages?.join?.("; ")) ||
    text.slice(0, 400);
  console.error(`Doppler download failed HTTP ${res.status}: ${msg}`);
  process.exit(1);
}

const raw = body[secretKey];
if (raw == null || String(raw).trim() === "") {
  console.error(
    `Secret "${secretKey}" missing or empty in this config (set BLACKGLASS_SSH_SECRET_NAME if you use another key).`,
  );
  process.exit(1);
}

console.log(
  `OK: Doppler config "${project}/${config}" reachable; "${secretKey}" is present (${String(raw).length} chars, value not shown).`,
);
