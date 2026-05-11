/**
 * Read-only Cloudflare zone audit for SEO / edge sanity.
 *
 *   set CLOUDFLARE_API_TOKEN=...   # Zone:Read (+ Account:Read if multi-account)
 *   npm run cf:audit-edge
 *
 * Rotate any token that was ever pasted into chat or logs.
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

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) {
    console.error("Missing CLOUDFLARE_API_TOKEN. Create a read-only token in Cloudflare → API Tokens.");
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const zr = await fetch(`${BASE}/zones?name=${encodeURIComponent(ZONE_NAME)}`, { headers });
  const zj = await zr.json();
  if (!zj.success) {
    console.error("Zone lookup failed:", JSON.stringify(zj.errors ?? zj, null, 2));
    process.exit(1);
  }
  const zone = zj.result?.[0];
  if (!zone) {
    console.error(`No zone named ${ZONE_NAME} found for this token.`);
    process.exit(1);
  }

  console.log("Zone:", zone.name, "| id:", zone.id, "| status:", zone.status, "| plan:", zone.plan?.name ?? "?");

  const sr = await fetch(`${BASE}/zones/${zone.id}/settings`, { headers });
  const sj = await sr.json();
  if (!sj.success) {
    console.error("Settings failed:", JSON.stringify(sj.errors ?? sj, null, 2));
    process.exit(1);
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
  process.exit(1);
});
