/**
 * Regression test: BullMQ rejects custom job IDs that contain ":" (it's
 * the internal namespace separator inside Redis keys).  We hit this in
 * production on 2026-05-07: the showcase auto-provision path was throwing
 * `Custom Id cannot contain :` from inside the public route's catch block,
 * so every auto-provision attempt silently failed and the demo sandbox
 * never advanced past `provisioning`.
 *
 * Lock the contract here: ALL string templates in `sandbox-queue.ts` that
 * are passed as `jobId` to `queue.add(...)` must use safe separators
 * (we use `-`).  If anyone reverts to `:`, this test fires before deploy.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const QUEUE_FILE = join(process.cwd(), "src/lib/server/queue/sandbox-queue.ts");

describe("sandbox-queue jobIds", () => {
  it("never builds a jobId template that contains ':'", () => {
    const src = readFileSync(QUEUE_FILE, "utf8");
    // Find every `jobId: \`...\`` template literal.
    const matches = [...src.matchAll(/jobId:\s*`([^`]+)`/g)];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    for (const m of matches) {
      expect(m[1], `jobId template "${m[1]}" must not contain ":"`).not.toMatch(/:/);
    }
  });

  it("documents the ':' prohibition in a comment near a jobId", () => {
    const src = readFileSync(QUEUE_FILE, "utf8");
    expect(src).toMatch(/BullMQ rejects jobIds containing ":"/i);
  });
});
