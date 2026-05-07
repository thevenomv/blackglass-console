/**
 * Regression test: the sandbox keypair MUST be in a format that the same
 * `ssh2` library can parse, because the sandbox-worker uses `ssh2.Client`
 * to run seed-drift commands on the Droplet.
 *
 * On 2026-05-07 the showcase seed-drift jobs all failed with
 *   `Error: Cannot parse privateKey: Unsupported key format`
 * because the provisioner was emitting PKCS#8 ed25519 PEM (Node's default)
 * which ssh2's parser does not accept — only OpenSSH armor works.
 *
 * If anyone reverts the provisioner to `node:crypto.generateKeyPairSync`
 * or otherwise changes the wire format, this test fires before deploy.
 */

import { describe, expect, it } from "vitest";
import { utils as sshUtils } from "ssh2";

describe("sandbox keypair format", () => {
  it("ssh2 can parse its own ed25519 OpenSSH output", () => {
    const { private: privPem, public: pubLine } = sshUtils.generateKeyPairSync("ed25519");
    expect(privPem).toMatch(/^-----BEGIN OPENSSH PRIVATE KEY-----/);
    expect(pubLine).toMatch(/^ssh-ed25519 /);

    const parsed = sshUtils.parseKey(privPem);
    // parseKey returns a single ParsedKey on success or an Error on failure.
    expect(parsed instanceof Error).toBe(false);
  });

  it("ssh2 cannot parse PKCS#8 ed25519 — proves why we don't use node:crypto", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ed25519");
    const pkcs8Pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    expect(pkcs8Pem).toMatch(/^-----BEGIN PRIVATE KEY-----/);

    const parsed = sshUtils.parseKey(pkcs8Pem);
    // If this assertion ever flips (i.e. ssh2 starts accepting PKCS#8
    // ed25519), the provisioner can be simplified — but until then this
    // test pins the behaviour we rely on.
    expect(parsed instanceof Error).toBe(true);
  });
});
