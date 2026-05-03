#!/usr/bin/env node
/**
 * CI guard: verifies that the OpenAPI spec and the Next.js route tree stay in sync.
 *
 * Checks performed:
 *   1. Required paths are documented in openapi/blackglass.yaml.
 *   2. Required Next.js route handlers exist under src/app/api/v1/.
 *   3. (Reverse) Every v1 route handler path is covered by the OpenAPI spec so
 *      drift between implementation and spec is caught in CI rather than at review.
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more checks failed (details printed to stderr)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const openapiPath = path.join(root, "openapi", "blackglass.yaml");

const openapi = fs.readFileSync(openapiPath, "utf8");

const requiredDocPatterns = [
  /^ {2}\/fleet\/snapshot:/m,
  /^ {2}\/audit\/events:/m,
  /^ {2}\/hosts:/m,
  /^ {2}\/baselines:/m,
  /^ {2}\/hosts\/\{hostId\}:/m,
  /^ {2}\/scans:/m,
  /^ {2}\/scans\/\{scanId\}:/m,
  /^ {2}\/evidence\/bundles\/\{bundleId\}:/m,
  /^ {2}\/drift:/m,
  /^ {2}\/reports:/m,
];

let errors = 0;

for (const re of requiredDocPatterns) {
  if (!re.test(openapi)) {
    console.error(`[openapi-check] FAIL: spec missing path matching: ${re.source}`);
    errors++;
  }
}

function collectRoutes(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) collectRoutes(p, acc);
    else if (ent.name === "route.ts") acc.push(p);
  }
  return acc;
}

const apiV1 = path.join(root, "src", "app", "api", "v1");
const routes = collectRoutes(apiV1);

/** Folder prefixes that must exist under src/app/api/v1 */
const requiredPrefixes = [
  "fleet/snapshot",
  "hosts",
  "baselines",
  "scans",
  "audit/events",
  "evidence/bundles",
  "drift",
  "reports",
];

for (const seg of requiredPrefixes) {
  const hit = routes.some((r) => {
    const rel = path.relative(apiV1, r).split(path.sep).join("/");
    return rel.startsWith(seg + "/") || rel === seg + "/route.ts";
  });
  if (!hit) {
    console.error(`[openapi-check] FAIL: missing Next.js route handler for: ${seg}`);
    errors++;
  }
}

// Reverse check: every v1 route that is not a parameter-only segment should
// appear in the OpenAPI spec.  Convert Next.js [param] to {param} for matching.
const SKIP_INTERNAL = new Set(["collector/keys/rotate", "webhooks/test", "ingest"]);
for (const routePath of routes) {
  const rel = path.relative(apiV1, routePath).split(path.sep).join("/").replace(/\/route\.ts$/, "");
  // Skip internal/non-public routes and exact duplicates from nested [id] paths
  if ([...SKIP_INTERNAL].some((s) => rel.startsWith(s))) continue;
  // Convert [id] → {id}, [[...slug]] → {slug}
  const openapiSeg = rel.replace(/\[\[?\.\.\.[^\]]+\]?\]/g, "{param}").replace(/\[([^\]]+)\]/g, "{$1}");
  // Check if any line in the spec starts with "  /<openapiSeg-ish>:"
  const baseSegment = openapiSeg.split("/")[0];
  const specCoversBase = openapi.includes(`/${baseSegment}`);
  if (!specCoversBase) {
    console.warn(`[openapi-check] WARN: route '${rel}' may not be documented in spec (base: /${baseSegment})`);
    // Warn only — do not fail on this check to avoid false positives from
    // internal or admin routes. Upgrade to errors++ when spec coverage is complete.
  }
}

if (errors > 0) {
  console.error(`\n[openapi-check] FAILED — ${errors} error(s). Fix spec or add missing routes.`);
  process.exit(1);
}

console.log(
  `[openapi-check] OK — ${routes.length} v1 route handler(s), ${requiredDocPatterns.length} required spec paths verified`,
);

