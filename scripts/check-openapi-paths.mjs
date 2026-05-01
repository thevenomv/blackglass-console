#!/usr/bin/env node
/**
 * Verifies OpenAPI documents core paths and that expected api/v1 route handlers exist.
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
];

let ok = true;
for (const re of requiredDocPatterns) {
  if (!re.test(openapi)) {
    console.error("OpenAPI missing path matching:", re.source);
    ok = false;
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
const requiredPrefixes = ["fleet/snapshot", "hosts", "baselines", "scans", "audit/events", "evidence/bundles"];

for (const seg of requiredPrefixes) {
  const hit = routes.some((r) => {
    const rel = path.relative(apiV1, r).split(path.sep).join("/");
    return rel.startsWith(seg + "/") || rel.startsWith(seg + "/route.ts") || rel === seg + "/route.ts";
  });
  if (!hit) {
    console.error("Missing Next route tree for:", seg);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log(
  "check-openapi-paths: OK (%s route handlers, openapi paths documented)",
  routes.length,
);
