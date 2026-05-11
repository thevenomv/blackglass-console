/**
 * Read-only Cloudflare zone audit for SEO / edge sanity.
 *
 *   set CLOUDFLARE_API_TOKEN=...   # see Cloudflare → My Profile → API Tokens
 *   npm run cf:audit-edge
 *
 * Use process.exitCode only (no process.exit) so Node on Windows can shut down
 * without libuv assertion noise after failed fetch.
 */

const ZONE_NAME = "blackglasssec.com";
const BASE = "https://api.cloudflare.com/client/v4";

const INTERESTING_SETTINGS = new Set([
  "ssl",
  "min_tls_version",
  "always_use_https",
  "automatic_https_rewrites",
  "opportunistic_encryption",
  "tls_1_3",
  "brotli",
  "security_level",
  "challenge_ttl",
  "browser_cache_ttl",
  "always_online",
  "development_mode",
  "email_obfuscation",
  "hotlink_protection",
  "server_side_exclude",
  "super_bot_fight_mode",
  "bot_fight_mode",
]);

function printInvalidTokenHelp() {
  console.error(`
Cloudflare returned "Invalid access token" (9109). Common causes:

  1. Wrong credential type — This script needs an API Token (Bearer), not the
     Global API Key. Global keys require X-Auth-Email + X-Auth-Key instead.

  2. Token revoked or expired — Create a new one: Dashboard → My Profile →
     API Tokens → Create Token → Custom token →
       Permissions: Zone → Zone → Read, Zone → Zone Settings → Read
     Include the zone blackglasssec.com (or All zones).

  3. Truncated / extra characters — Re-copy the token once; no spaces or quotes
     inside the value. In PowerShell: $env:CLOUDFLARE_API_TOKEN = 'paste-here'

  4. Not a v4 API token — Some other "cfk_…" or internal keys are not valid for
     GET https://api.cloudflare.com/client/v4/...

If this token was ever pasted into chat or a ticket, revoke it and create a new one.
`);
}

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) {
    console.error("Missing CLOUDFLARE_API_TOKEN. Create a read-only token in Cloudflare → API Tokens.");
    process.exitCode = 1;
    return;
  }

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const zr = await fetch(`${BASE}/zones?name=${encodeURIComponent(ZONE_NAME)}`, { headers });
  const zj = await zr.json();
  if (!zj.success) {
    console.error("Zone lookup failed:", JSON.stringify(zj.errors ?? zj, null, 2));
    const invalid = Array.isArray(zj.errors) && zj.errors.some((e) => e.code === 9109);
    if (invalid) printInvalidTokenHelp();
    process.exitCode = 1;
    return;
  }
  const zone = zj.result?.[0];
  if (!zone) {
    console.error(`No zone named ${ZONE_NAME} found for this token.`);
    console.error("Edit the token to include this zone, or fix ZONE_NAME in the script.");
    process.exitCode = 1;
    return;
  }

  console.log("Zone:", zone.name, "| id:", zone.id, "| status:", zone.status, "| plan:", zone.plan?.name ?? "?");

  const sr = await fetch(`${BASE}/zones/${zone.id}/settings`, { headers });
  const sj = await sr.json();
  if (!sj.success) {
    console.error("Settings failed:", JSON.stringify(sj.errors ?? sj, null, 2));
    process.exitCode = 1;
    return;
  }

  const rows = sj.result
    .filter((s) => INTERESTING_SETTINGS.has(s.id))
    .map((s) => ({ id: s.id, value: JSON.stringify(s.value) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  console.log("\nEdge settings (subset):\n");
  for (const r of rows) {
    console.log(`  ${r.id.padEnd(28)} ${r.value}`);
  }

  console.log("\nInterpretation:");
  const byId = Object.fromEntries(sj.result.map((s) => [s.id, s.value]));
  if (byId.ssl === "flexible") {
    console.log("  [warn] ssl=flexible — prefer full or strict for HTTPS quality.");
  } else if (byId.ssl === "strict" || byId.ssl === "full") {
    console.log("  [ok] ssl mode is", byId.ssl);
  }
  if (byId.super_bot_fight_mode === "on" || byId.bot_fight_mode === "on") {
    console.log("  [warn] Bot Fight / super bot fight on — confirm Googlebot is not blocked (GSC URL Inspection).");
  }
  console.log("  Done. Public checks: npm run cf:public-seo-check (no token).");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
