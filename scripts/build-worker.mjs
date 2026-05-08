                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 /**
 * Bundle the BullMQ workers for Node (CJS). TypeScript project emit is skipped
 * because `src/lib/server/**` pulls Next-only modules; esbuild strips unused paths.
 *
 * Outputs:
 *   dist/worker/scan-worker.cjs    — SSH fan-out + drift compute
 *   dist/worker/sandbox-worker.cjs — sandbox lifecycle (provision/seed/cleanup)
 *   dist/worker/ops-worker.cjs     — webhook delivery + data exports + retention sweep
 */
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const srcRoot = path.join(root, "src");

function resolveAtAlias(spec) {
  const rel = spec.slice(2);
  const base = path.join(srcRoot, rel);
  for (const ext of [".ts", ".tsx"]) {
    const f = base + ext;
    if (fs.existsSync(f)) return f;
  }
  const indexTs = path.join(base, "index.ts");
  if (fs.existsSync(indexTs)) return indexTs;
  return base + ".ts";
}

const aliasPlugin = {
  name: "alias-at-src",
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => ({
      path: resolveAtAlias(args.path),
    }));
  },
};

const workers = [
  { entry: "scan-worker.ts", outfile: "scan-worker.cjs" },
  { entry: "sandbox-worker.ts", outfile: "sandbox-worker.cjs" },
  { entry: "ops-worker.ts", outfile: "ops-worker.cjs" },
];

for (const { entry, outfile } of workers) {
  const entryPath = path.join(srcRoot, "worker", entry);
  if (!fs.existsSync(entryPath)) {
    console.warn(`[build-worker] skipping ${entry} (not found)`);
    continue;
  }
  await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: path.join(root, "dist", "worker", outfile),
    plugins: [aliasPlugin],
    packages: "external",
    logLevel: "info",
  });
}
