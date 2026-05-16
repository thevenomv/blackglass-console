#!/usr/bin/env node
/**
 * Verify RESEND_API_KEY and APOLLO_API_KEY from the environment or `.env.local`
 * (loaded the same way as send-test-emails.mjs). Never prints secret values.
 */
import process from "node:process";
import { spawnSync } from "node:child_process";

function loadDotenvLocal() {
  const dotenv = spawnSync(
    process.execPath,
    ["-e", "require('dotenv').config({ path: '.env.local' }); process.stdout.write(JSON.stringify(process.env));"],
    { encoding: "utf8", cwd: process.cwd() },
  );
  if (dotenv.status === 0 && dotenv.stdout) {
    try {
      const parsed = JSON.parse(dotenv.stdout);
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      /* ignore */
    }
  }
}

if (!process.env.RESEND_API_KEY?.trim() && !process.env.APOLLO_API_KEY?.trim()) {
  loadDotenvLocal();
}

const resendKey = process.env.RESEND_API_KEY?.trim();
const apolloKey = process.env.APOLLO_API_KEY?.trim();

let failed = false;

if (!resendKey) {
  console.log("[verify] RESEND_API_KEY — skipped (unset)");
} else {
  const r = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${resendKey}` },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("[verify] RESEND_API_KEY — FAILED", r.status, JSON.stringify(body));
    failed = true;
  } else {
    const n = Array.isArray(body.data) ? body.data.length : 0;
    console.log(`[verify] RESEND_API_KEY — OK (${n} domain(s) listed)`);
  }
}

if (!apolloKey) {
  console.log("[verify] APOLLO_API_KEY — skipped (unset; Next.js does not read this yet)");
} else {
  const r = await fetch("https://api.apollo.io/v1/auth/health", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": apolloKey,
    },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("[verify] APOLLO_API_KEY — FAILED", r.status, JSON.stringify(body));
    failed = true;
  } else {
    console.log("[verify] APOLLO_API_KEY — OK", JSON.stringify(body));
  }
}

process.exit(failed ? 1 : 0);
