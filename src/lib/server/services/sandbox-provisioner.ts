/**
 * Sandbox provisioner — creates and destroys ephemeral DO Droplets for tenant sandboxes.
 *
 * Architecture:
 *   1. Generates an ed25519 keypair in Node (never stored in plaintext).
 *   2. Stores the encrypted private key in tenant_credentials (label "sandbox").
 *   3. Calls DO API to create a Droplet, injecting the public key via cloud-init.
 *   4. Polls until the Droplet is active, then registers it in saasCollectorHosts.
 *   5. Runs a baseline scan, then applies drift seeds on a schedule.
 *
 * SECURITY: Customers never receive SSH credentials. Only the Blackglass
 * collector (running on the DO App Platform) can authenticate to the VM.
 * The DO Firewall applied to every sandbox Droplet:
 *   - Inbound: SSH (22) only
 *   - Outbound: unrestricted (needed for apt/package ops on cloud-init)
 *
 * Environment variables required:
 *   DO_API_TOKEN   — DigitalOcean personal access token (PAT) with Droplet write scope
 *   DATABASE_URL   — used by withBypassRls for provisioner operations
 *   KMS_PROVIDER / KMS_LOCAL_SECRET — for envelope-encrypting the keypair
 */

import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { withBypassRls, withTenantRls, schema } from "@/db";
import { encryptKey } from "@/lib/server/secrets/envelope";
import { eq, and, ne } from "drizzle-orm";

const { saasSandboxes, tenantCredentials, saasCollectorHosts } = schema;

// ---------------------------------------------------------------------------
// DO API helpers
// ---------------------------------------------------------------------------

const DO_API = "https://api.digitalocean.com/v2";

function doHeaders() {
  const token = process.env.DO_API_TOKEN?.trim();
  if (!token) throw new Error("DO_API_TOKEN is not set — cannot provision sandbox Droplet");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function doRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${DO_API}${path}`, {
    method,
    headers: doHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DO API ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as T;
}

// ---------------------------------------------------------------------------
// Cloud-init user-data
// ---------------------------------------------------------------------------

/**
 * Generates the cloud-init user-data script for a sandbox Droplet.
 * - Creates the `blackglass` scan user with the provided public key.
 * - Installs `ncat` and `nginx` to provide rich drift targets.
 * - UFW: blocks all inbound except SSH (22).
 * - Customers have NO way to log in — only the Blackglass collector key works.
 */
function buildCloudInit(pubKeyOpenSsh: string): string {
  return `#!/bin/bash
set -euo pipefail

# Create scan user
useradd -r -m -s /usr/sbin/nologin blackglass
mkdir -p /home/blackglass/.ssh
echo '${pubKeyOpenSsh}' >> /home/blackglass/.ssh/authorized_keys
chown -R blackglass:blackglass /home/blackglass/.ssh
chmod 700 /home/blackglass/.ssh
chmod 600 /home/blackglass/.ssh/authorized_keys

# Allow blackglass to run id/ss/find/cat without password (read-only audit)
echo 'blackglass ALL=(ALL) NOPASSWD: /usr/bin/id, /usr/bin/ss, /usr/bin/find, /usr/bin/cat, /usr/bin/getent, /usr/sbin/sshd' \
  > /etc/sudoers.d/blackglass-scan
chmod 440 /etc/sudoers.d/blackglass-scan

# Install drift targets
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ncat nginx rsyslog ufw

# UFW: SSH only inbound, full outbound
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable

# Disable root password auth (key-only, and only blackglass key)
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh || true

# Upload seed script
mkdir -p /root/sandbox
cat > /root/sandbox/seed.sh << 'SEEDEOF'
SEED_PLACEHOLDER
SEEDEOF
chmod +x /root/sandbox/seed.sh

echo "[blackglass-sandbox] cloud-init done"
`;
}

// ---------------------------------------------------------------------------
// Keypair generation
// ---------------------------------------------------------------------------

type SandboxKeypair = {
  /** PEM-encoded ed25519 private key (PKCS#8 format). */
  privateKeyPem: string;
  /** OpenSSH public key string for authorized_keys injection. */
  pubKeyOpenSsh: string;
  /** SHA-256 fingerprint for display (hex). */
  fingerprint: string;
};

function generateSandboxKeypair(): SandboxKeypair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

  // Export as DER then convert to OpenSSH wire format
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  // ed25519 SPKI: last 32 bytes are the raw public key
  const rawPub = pubDer.slice(-32);
  const keyType = Buffer.from("ssh-ed25519");
  const typeLen = Buffer.allocUnsafe(4);
  typeLen.writeUInt32BE(keyType.length, 0);
  const keyLen = Buffer.allocUnsafe(4);
  keyLen.writeUInt32BE(rawPub.length, 0);
  const wire = Buffer.concat([typeLen, keyType, keyLen, rawPub]);
  const pubKeyOpenSsh = `ssh-ed25519 ${wire.toString("base64")} blackglass-sandbox`;

  // SHA-256 fingerprint of the public key wire bytes
  const { createHash } = require("node:crypto");
  const fingerprint = createHash("sha256").update(wire).digest("hex");

  return { privateKeyPem, pubKeyOpenSsh, fingerprint };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Provision a fresh sandbox for a tenant.
 *
 * Returns the new sandbox row ID. The actual Droplet is provisioned
 * asynchronously — the caller should poll `getSandboxStatus` or let the
 * BullMQ `sandbox:provision` job manage the full lifecycle.
 */
export async function provisionSandbox(tenantId: string): Promise<string> {
  const region = process.env.SANDBOX_REGION?.trim() || "lon1";

  // 1. Check no active sandbox exists
  const existing = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasSandboxes)
      .where(
        and(
          eq(saasSandboxes.tenantId, tenantId),
          ne(saasSandboxes.status, "destroyed"),
        ),
      ),
  );
  if (existing.length > 0) {
    return existing[0].id;
  }

  // 2. Generate keypair
  const { privateKeyPem, pubKeyOpenSsh, fingerprint } = generateSandboxKeypair();

  // 3. Envelope-encrypt and store private key
  const encrypted = await encryptKey(tenantId, privateKeyPem);
  const encryptedKeyJson = JSON.stringify(encrypted);

  const [cred] = await withTenantRls(tenantId, (db) =>
    db
      .insert(tenantCredentials)
      .values({
        tenantId,
        label: "sandbox",
        encryptedKey: encryptedKeyJson,
        algorithm: "ed25519",
        comment: "Blackglass sandbox — managed keypair, do not modify",
        fingerprint,
      })
      .onConflictDoUpdate({
        target: [tenantCredentials.tenantId, tenantCredentials.label],
        set: {
          encryptedKey: encryptedKeyJson,
          fingerprint,
          rotatedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning(),
  );

  // 4. Insert sandbox row
  const [sandbox] = await withTenantRls(tenantId, (db) =>
    db
      .insert(saasSandboxes)
      .values({
        tenantId,
        credentialId: cred.id,
        region,
        status: "provisioning",
        ttlExpiresAt: ttlFromNow(),
      })
      .returning(),
  );

  // 5. Call DO API to create Droplet
  const cloudInit = buildCloudInit(pubKeyOpenSsh);
  let dropletId: string | null = null;
  try {
    const resp = await doRequest<{ droplet: { id: number } }>("POST", "/droplets", {
      name: `bg-sandbox-${sandbox.id.slice(0, 8)}`,
      region,
      size: "s-1vcpu-1gb",
      image: "ubuntu-22-04-x64",
      user_data: cloudInit,
      tags: ["blackglass-sandbox"],
      ipv6: false,
    });
    dropletId = String(resp.droplet.id);
  } catch (err) {
    await withBypassRls((db) =>
      db
        .update(saasSandboxes)
        .set({
          status: "error",
          errorMessage: err instanceof Error ? err.message : String(err),
          updatedAt: new Date(),
        })
        .where(eq(saasSandboxes.id, sandbox.id)),
    );
    throw err;
  }

  // 6. Update sandbox row with droplet ID
  await withBypassRls((db) =>
    db
      .update(saasSandboxes)
      .set({ dropletId, updatedAt: new Date() })
      .where(eq(saasSandboxes.id, sandbox.id)),
  );

  return sandbox.id;
}

/**
 * Poll DO API until the Droplet transitions to "active" and has an IP,
 * then register the host in saasCollectorHosts.
 * Returns the public IP on success, throws on timeout/error.
 */
export async function activateSandbox(
  sandboxId: string,
  tenantId: string,
): Promise<{ ip: string; hostId: string }> {
  const [sandbox] = await withBypassRls((db) =>
    db.select().from(saasSandboxes).where(eq(saasSandboxes.id, sandboxId)),
  );
  if (!sandbox?.dropletId) throw new Error("Sandbox has no dropletId — cannot activate");

  // Poll up to 5 minutes
  const deadline = Date.now() + 5 * 60_000;
  let ip: string | null = null;
  while (Date.now() < deadline) {
    const resp = await doRequest<{
      droplet: { status: string; networks: { v4: { ip_address: string; type: string }[] } };
    }>("GET", `/droplets/${sandbox.dropletId}`);

    if (resp.droplet.status === "active") {
      const pub = resp.droplet.networks.v4.find((n) => n.type === "public");
      if (pub) {
        ip = pub.ip_address;
        break;
      }
    }
    await sleep(8_000);
  }
  if (!ip) throw new Error("Sandbox Droplet did not become active within 5 minutes");

  // Register host
  const [host] = await withTenantRls(tenantId, (db) =>
    db
      .insert(saasCollectorHosts)
      .values({
        tenantId,
        hostname: ip!,
        label: "Sandbox",
        sshUser: "blackglass",
        sshPort: 22,
        credentialId: sandbox.credentialId ?? undefined,
      })
      .onConflictDoUpdate({
        target: [saasCollectorHosts.tenantId, saasCollectorHosts.hostname],
        set: {
          label: "Sandbox",
          credentialId: sandbox.credentialId ?? undefined,
          updatedAt: new Date(),
        },
      })
      .returning(),
  );

  await withBypassRls((db) =>
    db
      .update(saasSandboxes)
      .set({
        dropletIp: ip,
        hostId: host.id,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(saasSandboxes.id, sandboxId)),
  );

  return { ip: ip!, hostId: host.id };
}

/**
 * Destroy a sandbox Droplet and mark the row as destroyed.
 * Safe to call multiple times (idempotent).
 */
export async function destroySandbox(sandboxId: string): Promise<void> {
  const [sandbox] = await withBypassRls((db) =>
    db.select().from(saasSandboxes).where(eq(saasSandboxes.id, sandboxId)),
  );
  if (!sandbox) return;

  await withBypassRls((db) =>
    db
      .update(saasSandboxes)
      .set({ status: "destroying", updatedAt: new Date() })
      .where(eq(saasSandboxes.id, sandboxId)),
  );

  if (sandbox.dropletId) {
    try {
      await doRequest("DELETE", `/droplets/${sandbox.dropletId}`);
    } catch (err) {
      // 404 = already gone — that's fine
      if (!(err instanceof Error && err.message.includes("404"))) {
        throw err;
      }
    }
  }

  // Remove host registration
  if (sandbox.hostId) {
    await withBypassRls((db) =>
      db.delete(saasCollectorHosts).where(eq(saasCollectorHosts.id, sandbox.hostId!)),
    );
  }

  // Remove credential
  if (sandbox.credentialId) {
    await withBypassRls((db) =>
      db.delete(tenantCredentials).where(eq(tenantCredentials.id, sandbox.credentialId!)),
    );
  }

  await withBypassRls((db) =>
    db
      .update(saasSandboxes)
      .set({ status: "destroyed", updatedAt: new Date() })
      .where(eq(saasSandboxes.id, sandboxId)),
  );
}

/**
 * TTL for a new sandbox — defaults to 4 hours; override with SANDBOX_TTL_HOURS env.
 */
function ttlFromNow(): Date {
  const hours = parseInt(process.env.SANDBOX_TTL_HOURS ?? "4", 10);
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
