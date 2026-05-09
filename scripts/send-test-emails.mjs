#!/usr/bin/env node
/**
 * Fire every transactional email template at a target inbox so an
 * operator can confirm Resend is configured, the From domain is
 * authenticated (SPF/DKIM/DMARC pass), templates render across mail
 * clients, and the messages don't land in spam.
 *
 * Usage:
 *   node scripts/send-test-emails.mjs --to=jamie@obsidiandynamics.co.uk
 *   node scripts/send-test-emails.mjs --to=you@x.com --template=welcome
 *
 * Env (must be set or sourced from .env.local):
 *   RESEND_API_KEY    — required, the Resend API key
 *   EMAIL_FROM        — optional, defaults to "Blackglass <noreply@blackglasssec.com>"
 *   NEXT_PUBLIC_APP_URL — optional, used in CTA buttons (defaults to https://blackglasssec.com)
 *
 * Why a dedicated CLI when /api/admin/test-email exists too: lets you
 * validate Resend BEFORE deploying — catch bad keys / unverified domains
 * locally instead of after a roundtrip through DigitalOcean.
 *
 * Returns exit 0 when every send succeeds, exit 1 otherwise. Resend
 * message IDs are printed so you can correlate with the Resend
 * dashboard for delivery + open tracking.
 */
import process from "node:process";
import { spawnSync } from "node:child_process";

const ALLOWED = new Set([
  "welcome",
  "drift-alert",
  "drift-digest",
  "trial-expiring",
  "trial-expired",
  "all",
]);

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : fallback;
}

const to = arg("to", process.env.TEST_EMAIL_TO);
const template = arg("template", "all");

if (!to) {
  console.error("Usage: node scripts/send-test-emails.mjs --to=<email> [--template=welcome|drift-alert|drift-digest|trial-expiring|trial-expired|all]");
  process.exit(2);
}

if (!ALLOWED.has(template)) {
  console.error(`--template must be one of: ${[...ALLOWED].join(", ")}`);
  process.exit(2);
}

if (!process.env.RESEND_API_KEY) {
  // Try to source from .env.local — convenience for local dev.
  // In production / CI the key is expected to come from the env directly.
  const dotenv = spawnSync(
    process.execPath,
    ["-e", "require('dotenv').config({ path: '.env.local' }); process.stdout.write(JSON.stringify(process.env));"],
    { encoding: "utf8" },
  );
  if (dotenv.status === 0 && dotenv.stdout) {
    try {
      const parsed = JSON.parse(dotenv.stdout);
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      /* ignore — we'll error below if the key is still missing */
    }
  }
}

if (!process.env.RESEND_API_KEY) {
  console.error("RESEND_API_KEY is not set. Add it to .env.local or export it before running this script.");
  process.exit(2);
}

console.log(`[send-test-emails] template=${template} to=${to} from=${process.env.EMAIL_FROM ?? "Blackglass <noreply@blackglasssec.com>"}`);

// Use tsx so we can import the TS sendEmail + templates straight from src/
// without a build step.
const result = spawnSync(
  "npx",
  [
    "tsx",
    "--tsconfig",
    "tsconfig.json",
    new URL("./_send-test-emails.ts", import.meta.url).pathname.replace(/^\//, "/").replace(/\\/g, "/"),
    `--to=${to}`,
    `--template=${template}`,
  ],
  { stdio: "inherit", shell: true, cwd: process.cwd() },
);

process.exit(result.status ?? 1);
