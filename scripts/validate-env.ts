import { parseServerEnv } from "../src/config/env";

const r = parseServerEnv();
if (!r.ok) {
  console.error("[env:check]", r.message);
  process.exit(1);
}
console.log("[env:check] OK — see src/config/env.ts for validated keys.");
process.exit(0);
