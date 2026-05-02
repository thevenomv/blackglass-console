#!/usr/bin/env node
/**
 * Deletes `.next/` (fixes flaky OneDrive EINVAL readlink rebuilds — see docs/troubleshooting-local-build.md).
 */
import { rmSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), ".next");

rmSync(dir, {
  recursive: true,
  force: true,
  maxRetries: 12,
  retryDelay: 100,
});
