#!/usr/bin/env node
/**
 * Copy scripts/local-credentials.example.json → .local/credentials.json
 * if the target does not exist, then print edit instructions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const example = path.join(__dirname, "local-credentials.example.json");
const dir = path.join(root, ".local");
const dest = path.join(dir, "credentials.json");

fs.mkdirSync(dir, { recursive: true });

if (fs.existsSync(dest)) {
  console.log(`[secrets:init-local] already exists: ${path.relative(root, dest)}`);
  console.log("Edit that file, then: npm run secrets:merge-local");
  process.exit(0);
}

fs.copyFileSync(example, dest);
console.log(`[secrets:init-local] created ${path.relative(root, dest)}`);
console.log("1. Open the file and replace the placeholder values with your real API keys.");
console.log("2. Run: npm run secrets:merge-local");
console.log("3. Run: npm run secrets:verify");
process.exit(0);
