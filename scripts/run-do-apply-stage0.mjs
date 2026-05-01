#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const candidates = [
  ["py", "-3", "scripts/do_apply_stage0.py"],
  ["python3", "scripts/do_apply_stage0.py"],
  ["python", "scripts/do_apply_stage0.py"],
];

for (const args of candidates) {
  const r = spawnSync(args[0], args.slice(1), { stdio: "inherit" });
  if (r.error?.code === "ENOENT") continue;
  process.exit(r.status ?? 1);
}

console.error("Python not found. Install Python 3 or run: py -3 scripts/do_apply_stage0.py");
process.exit(1);
