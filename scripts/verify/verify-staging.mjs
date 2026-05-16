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
  } else {
    // diagnostics_scope is only present for authenticated callers; unauthenticated
    // uptime probes get ok+service only — that is correct behaviour.
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
  } else if (hosts.res.status === 401 || hosts.res.status === 403) {
    // Auth-gated endpoint correctly rejecting an unauthenticated probe — auth guard is working.
    pass(`GET /api/v1/hosts (auth guard active — HTTP ${hosts.res.status})`);
  } else if (!hosts.res.ok) {
    fail("GET /api/v1/hosts", `HTTP ${hosts.res.status}`);
  } else if (!Array.isArray(hosts.json?.items)) {
    fail("GET /api/v1/hosts", "expected items array");
  } else {
    pass(`GET /api/v1/hosts (${hosts.json.items.length} items)`);
  }

  // Lab-health probe runs the same TCP+banner check that Settings →
  // Operator → Sales-demo VM uses. Auth-gated on production, so we
  // only count it as an active check if the response carries a body
  // (i.e. someone exposed the route without auth or set VERIFY_LAB=1
  // with a session cookie). The 401/403 path is treated as a pass —
  // the route exists and is correctly gated.
  const lab = await get("/api/admin/lab-health");
  if (lab.fetchError) {
    fail("GET /api/admin/lab-health", lab.fetchError);
  } else if (lab.res.status === 401 || lab.res.status === 403) {
    pass(`GET /api/admin/lab-health (auth guard active — HTTP ${lab.res.status})`);
  } else if (!lab.res.ok) {
    fail("GET /api/admin/lab-health", `HTTP ${lab.res.status}`);
  } else if (lab.json?.configured && !lab.json.tcpReachable) {
    // The endpoint says lab VM is configured but not reachable — that
    // is exactly the kind of regression staging-smoke should catch
    // before a sales call. Hard-fail so the deployment is flagged.
    fail(
      "GET /api/admin/lab-health",
      `lab VM unreachable: ${(lab.json.warnings ?? []).join(" | ").slice(0, 200)}`,
    );
  } else if (lab.json?.configured && !lab.json.bannerLooksHealthy) {
    fail(
      "GET /api/admin/lab-health",
      `lab VM TCP open but no SSH banner: ${(lab.json.warnings ?? []).join(" | ").slice(0, 200)}`,
    );
  } else {
    const detail = lab.json?.configured
      ? `${lab.json.hostName ?? lab.json.host}:${lab.json.port} healthy (${lab.json.latencyMs}ms)`
      : "not configured (skipped)";
    pass(`GET /api/admin/lab-health (${detail})`);
  }

  const audit = await get("/api/v1/audit/events?limit=5");
  if (audit.fetchError) {
    fail("GET /api/v1/audit/events", audit.fetchError);
  } else if (audit.res.status === 401 || audit.res.status === 403) {
    // Auth-gated endpoint correctly rejecting an unauthenticated probe — auth guard is working.
    pass(`GET /api/v1/audit/events (auth guard active — HTTP ${audit.res.status})`);
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
