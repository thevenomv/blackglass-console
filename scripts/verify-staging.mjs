#!/usr/bin/env node
/**
 * Smoke a deployed BLACKGLASS instance (staging or prod) before calling it "SaaS-ready".
 *
 * Usage:
 *   STAGING_URL=https://your-app.ondigitalocean.app node scripts/verify-staging.mjs
 *
 * Optional:
 *   VERIFY_SECRETS_PROBE=1   — also GET /api/health?probe=secrets (respect rate limits)
 */

const base = process.env.STAGING_URL?.replace(/\/$/, "");
if (!base) {
  console.error(
    [
      "Set STAGING_URL to the deployed origin (e.g. https://console.example.com).",
      "GitHub Actions: add repository secret STAGING_URL (Settings → Secrets and variables → Actions).",
      "Local: STAGING_URL=https://… npm run verify:staging",
    ].join("\n"),
  );
  process.exit(1);
}

const checks = [];

async function get(path) {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = null;
    }
    return { url, res, json, text, fetchError: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      url,
      res: { ok: false, status: 0 },
      json: null,
      text: "",
      fetchError: msg,
    };
  }
}

function pass(name) {
  checks.push({ name, ok: true });
  console.log(`OK   ${name}`);
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log(`Verifying ${base}\n`);

  const h = await get("/api/health");
  if (h.fetchError) {
    fail("GET /api/health", h.fetchError);
  } else if (!h.res.ok) {
    fail("GET /api/health", `HTTP ${h.res.status} ${h.text.slice(0, 200)}`);
  } else if (!h.json?.ok) {
    fail("GET /api/health", "body.ok is not true");
  } else if (!h.json?.diagnostics_scope) {
    fail("GET /api/health", "missing diagnostics_scope");
  } else {
    pass("GET /api/health");
  }

  if (process.env.VERIFY_SECRETS_PROBE === "1") {
    const p = await get("/api/health?probe=secrets");
    if (p.fetchError) {
      fail("GET /api/health?probe=secrets", p.fetchError);
    } else if (!p.res.ok) {
      fail("GET /api/health?probe=secrets", `HTTP ${p.res.status}`);
    } else if (!p.json?.secrets_probe) {
      fail("GET /api/health?probe=secrets", "missing secrets_probe");
    } else {
      pass("GET /api/health?probe=secrets");
    }
  } else {
    pass("GET /api/health?probe=secrets (skipped — set VERIFY_SECRETS_PROBE=1)");
  }

  const hosts = await get("/api/v1/hosts");
  if (hosts.fetchError) {
    fail("GET /api/v1/hosts", hosts.fetchError);
  } else if (!hosts.res.ok) {
    fail("GET /api/v1/hosts", `HTTP ${hosts.res.status}`);
  } else if (!Array.isArray(hosts.json?.items)) {
    fail("GET /api/v1/hosts", "expected items array");
  } else {
    pass(`GET /api/v1/hosts (${hosts.json.items.length} items)`);
  }

  const audit = await get("/api/v1/audit/events?limit=5");
  if (audit.fetchError) {
    fail("GET /api/v1/audit/events", audit.fetchError);
  } else if (!audit.res.ok) {
    fail("GET /api/v1/audit/events", `HTTP ${audit.res.status}`);
  } else if (!Array.isArray(audit.json?.items)) {
    fail("GET /api/v1/audit/events", "expected items array");
  } else {
    pass("GET /api/v1/audit/events");
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${failed.length === 0 ? "All automated checks passed." : `Failed: ${failed.length}`}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
