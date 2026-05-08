#!/usr/bin/env node
/**
 * One-shot: repoint App Platform's COLLECTOR_HOST_1 (and friends) at the
 * blackglass-rustdesk-demo droplet. Adds host-167-99-59-55 to
 * INGEST_HOST_KEYS_JSON and ensures LAB_AGENT_HOST_ID is set.
 *
 * Required env:
 *   DO_TOKEN     — DigitalOcean API token
 *   APP_ID       — App Platform app id
 *   HOST_KEYS    — full JSON for INGEST_HOST_KEYS_JSON (string)
 *
 * Safe to re-run: idempotent for the four env vars it touches.
 */
import fs from "node:fs";
import process from "node:process";

const DO_TOKEN = process.env.DO_TOKEN?.trim();
const APP_ID = process.env.APP_ID?.trim();
const HOST_KEYS = process.env.HOST_KEYS?.trim();
if (!DO_TOKEN || !APP_ID || !HOST_KEYS) {
  console.error("Missing DO_TOKEN, APP_ID, or HOST_KEYS env");
  process.exit(2);
}

const targets = {
  COLLECTOR_HOST_1: { value: "167.99.59.55" },
  COLLECTOR_HOST_1_NAME: { value: "blackglass-rustdesk-demo" },
  LAB_AGENT_HOST_ID: { value: "host-167-99-59-55" },
  INGEST_HOST_KEYS_JSON: { value: HOST_KEYS, type: "SECRET" },
};

async function api(method, path, body) {
  const res = await fetch(`https://api.digitalocean.com/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${DO_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : {};
}

console.log(`==> fetching app ${APP_ID}`);
const got = await api("GET", `/apps/${APP_ID}`);
const spec = got.app.spec;

const web = spec.services.find((s) => s.name === "web");
if (!web) throw new Error("no 'web' service in spec");
web.envs = web.envs || [];

let touched = 0;
for (const [key, { value, type }] of Object.entries(targets)) {
  const existing = web.envs.find((e) => e.key === key);
  if (existing) {
    if (existing.value !== value) {
      existing.value = value;
      touched += 1;
      console.log(`   ~ ${key} → ${key === "INGEST_HOST_KEYS_JSON" ? "<json>" : value}`);
    } else {
      console.log(`   = ${key} (already current)`);
    }
  } else {
    web.envs.push({
      key,
      value,
      scope: "RUN_TIME",
      ...(type ? { type } : {}),
    });
    touched += 1;
    console.log(`   + ${key} (added) → ${key === "INGEST_HOST_KEYS_JSON" ? "<json>" : value}`);
  }
}

if (touched === 0) {
  console.log("\nNothing to change. Spec is already pointing at rustdesk demo.");
  process.exit(0);
}

fs.writeFileSync(
  ".do/app-update-payload.json",
  JSON.stringify({ spec }, null, 2),
);
console.log(`\n==> PUT spec (${touched} change${touched === 1 ? "" : "s"}) ...`);
const updated = await api("PUT", `/apps/${APP_ID}`, { spec });
const dep = updated.app.pending_deployment?.id || "(none)";
console.log(`==> ok. pending_deployment=${dep}`);
console.log(`    monitor: doctl apps get-deployment ${APP_ID} ${dep}`);
