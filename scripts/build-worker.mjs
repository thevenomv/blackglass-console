/**
 * Bundle the BullMQ scan worker for Node (CJS). TypeScript project emit is skipped
 * because `src/lib/server/**` pulls Next-only modules; esbuild strips unused paths.
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

await esbuild.build({
  entryPoints: [path.join(srcRoot, "worker", "scan-worker.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: path.join(root, "dist", "worker", "scan-worker.cjs"),
  /** Resolve `@/…` like tsconfig paths */
  plugins: [
    {
      name: "alias-at-src",
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => ({
          path: resolveAtAlias(args.path),
        }));
      },
    },
  ],
  packages: "external",
  logLevel: "info",
});
