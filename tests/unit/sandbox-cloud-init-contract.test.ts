/**
 * Contract test: the cloud-init sudoers entry and the sandbox-worker's SSH
 * exec command MUST agree on the seed-script path. If they diverge, every
 * seed-drift job will silently fail with `sudo: a password is required`
 * (sudoers won't authorize the invoked command), and the showcase sandbox
 * will be stuck at seedPhase=0 forever — exactly what happened in the
 * 2026-05-07 incident (see docs/runbooks/operations.md §4b).
 *
 * This file is also a guard against subtler regressions:
 *   - reverting blackglass to /usr/sbin/nologin (sshd exec channel breaks)
 *   - dropping `UseDNS no` (handshake times out behind ufw)
 *   - dropping the DNS allowlist in ufw (same)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROVISIONER = readFileSync(
  join(process.cwd(), "src/lib/server/services/sandbox-provisioner.ts"),
  "utf8",
);
const WORKER = readFileSync(
  join(process.cwd(), "src/worker/sandbox-worker.ts"),
  "utf8",
);

describe("sandbox cloud-init contract", () => {
  it("worker invokes the exact path that sudoers permits", () => {
    // Worker side: capture the path inside the sudo template literal.
    const m = WORKER.match(/sudo\s+(\/[^\s`${}]+)\s+\$\{safePha\}/);
    expect(m, "worker must call `sudo /<path> ${safePha}`").not.toBeNull();
    const workerPath = m![1];

    // Provisioner side: capture the path inside the sudoers entry.
    const sudoers = PROVISIONER.match(
      /blackglass\s+ALL=\(ALL\)\s+NOPASSWD:\s+(\/[^\s'`,]+)/,
    );
    expect(sudoers, "sudoers must allow blackglass to run a single path").not.toBeNull();
    const sudoersPath = sudoers![1];

    expect(workerPath).toBe(sudoersPath);
  });

  it("blackglass user has a real shell, not nologin", () => {
    // Allow /bin/bash or /bin/sh — anything that lets sshd exec a command.
    expect(PROVISIONER).toMatch(/useradd[^\n]*-s\s+\/bin\/(bash|sh)\s+blackglass/);
    expect(PROVISIONER).not.toMatch(/useradd[^\n]*\/usr\/sbin\/nologin\s+blackglass/);
  });

  it("sshd is configured with UseDNS no (avoids reverse-lookup hang)", () => {
    expect(PROVISIONER).toMatch(/UseDNS\s+no/);
  });

  it("ufw allowlist permits outbound DNS even after lockdown", () => {
    // We require BOTH UDP/53 and a TCP/53 fallback — a single rule isn't
    // enough because some resolvers fail over to TCP for large responses.
    expect(PROVISIONER).toMatch(/ufw\s+allow\s+out\s+53\/udp/);
    expect(PROVISIONER).toMatch(/ufw\s+allow\s+out\s+53\/tcp/);
  });
});
