/**
 * GET /api/public/sandbox-showcase
 *
 * Returns live state from the shared showcase sandbox — a Blackglass-owned
 * Droplet that is always running with drift seeded on a rolling schedule.
 *
 * PUBLIC — no auth required. Rate-limited by IP.
 * Data is read-only and scoped to SANDBOX_SHOWCASE_TENANT_ID.
 *
 * Environment variables:
 *   SANDBOX_SHOWCASE_TENANT_ID — UUID of the showcase tenant row
 *                                 (set in Doppler; omitting disables the endpoint)
 *
 * Response shape:
 *   {
 *     status: "online" | "provisioning" | "unavailable",
 *     sandbox: SaasSandbox | null,
 *     recentEvents: ShowcaseEvent[],
 *   }
 */

import { NextResponse } from "next/server";
import { withBypassRls, schema } from "@/db";
import { eq, and, ne, desc } from "drizzle-orm";
import { checkSandboxShowcaseRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { provisionSandbox } from "@/lib/server/services/sandbox-provisioner";
import { enqueueSandboxProvision } from "@/lib/server/queue/sandbox-queue";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Process-wide throttle for the auto-provision branch — prevents a request
 * loop (bot or browser tab left open) from creating a queue stampede when
 * the showcase Droplet is briefly missing.  Default 60s; override with
 * SHOWCASE_PROVISION_THROTTLE_MS.
 */
let lastShowcaseProvisionAt = 0;
function canKickShowcaseProvision(): boolean {
  const throttleMs = Number(process.env.SHOWCASE_PROVISION_THROTTLE_MS ?? "60000");
  const now = Date.now();
  if (now - lastShowcaseProvisionAt < throttleMs) return false;
  lastShowcaseProvisionAt = now;
  return true;
}

/**
 * Service names that are installed on every DigitalOcean Droplet by the
 * platform itself and must never surface as drift findings in the showcase.
 * droplet-agent is DO's own management service and is not attacker activity.
 */
const KNOWN_BENIGN_SERVICES = new Set([
  "droplet-agent",
  "droplet-agent.service",
  "do-agent",
  "do-agent.service",
]);

// Drift scene descriptions for each seed phase (matches sandbox-seed.sh)
const SCENE_LABELS: Record<number, {
  title: string;
  category: string;
  severity: string;
  rationale: string;
  suggestedActions: string[];
}> = {
  1: {
    title: "Backdoor port listener on TCP 4444",
    category: "LISTENERS",
    severity: "high",
    rationale: "An unexpected process is listening on TCP 4444. This port is commonly used by reverse shells and C2 frameworks such as Metasploit. It was not present in the baseline.",
    suggestedActions: [
      "Run `ss -tlnp | grep 4444` to identify the process",
      "Terminate the process and remove any associated binary or script",
      "Check crontabs and systemd units for persistence mechanisms",
    ],
  },
  2: {
    title: "NOPASSWD sudoers entry added",
    category: "SUDOERS",
    severity: "critical",
    rationale: "A sudoers rule now allows password-less privilege escalation. This was not present in the baseline. Any process running as this user can silently gain root.",
    suggestedActions: [
      "Run `sudo visudo` and remove the NOPASSWD line",
      "Check /etc/sudoers.d/ for drop-in files",
      "Audit which accounts triggered sudo since the change",
    ],
  },
  3: {
    title: "Rogue user account 'attacker-ssh' created",
    category: "USERS",
    severity: "high",
    rationale: "User account 'attacker-ssh' (UID 1002) was not present in the baseline. Unauthorized accounts are a primary persistence mechanism — they survive reboots and password rotations.",
    suggestedActions: [
      "Audit the purpose of account 'attacker-ssh'",
      "Check for associated SSH keys, crons, and running processes",
      "Remove account if not authorised: `userdel -r attacker-ssh`",
    ],
  },
  4: {
    title: "Rogue user added to sudo group",
    category: "SUDO_GROUP",
    severity: "critical",
    rationale: "'attacker-ssh' is now in the sudo group but was not in the baseline. Granting sudo access is a high-impact change that enables full host compromise with a single credential.",
    suggestedActions: [
      "Remove from sudo group: `gpasswd -d attacker-ssh sudo`",
      "Rotate credentials for all privileged accounts",
      "Review sudoers policy and group memberships",
    ],
  },
  5: {
    title: "sshd PermitRootLogin changed to yes",
    category: "SSH_CONFIG",
    severity: "critical",
    rationale: "Root SSH login is now permitted without restriction. This bypasses sudo logging and drastically increases the blast radius of any credential compromise.",
    suggestedActions: [
      "Revert /etc/ssh/sshd_config: set PermitRootLogin to without-password or no",
      "Restart sshd: `systemctl restart sshd`",
      "Audit recent root SSH sessions in /var/log/auth.log",
    ],
  },
  6: {
    title: "Cron backdoor to external C2 added",
    category: "CRON",
    severity: "critical",
    rationale: "A new cron file was added that was not in the baseline. The job periodically calls out to an external address — a classic command-and-control beacon pattern.",
    suggestedActions: [
      "Inspect /etc/cron.d/ for the new file and remove it",
      "Check for related processes and network connections",
      "Block egress to unknown external IPs at the firewall",
    ],
  },
  7: {
    title: "SUID binary planted in /usr/local/bin",
    category: "FILE_INTEGRITY",
    severity: "high",
    rationale: "A new SUID binary appeared in /usr/local/bin. SUID binaries execute with the file owner's privileges regardless of who runs them — a standard local privilege escalation technique.",
    suggestedActions: [
      "Find SUID files: `find /usr/local/bin -perm /4000`",
      "Remove or strip SUID bit: `chmod u-s <file>`",
      "Verify file integrity against a known-good baseline",
    ],
  },
  8: {
    title: "World-writable /etc/passwd",
    category: "FILE_INTEGRITY",
    severity: "critical",
    rationale: "/etc/passwd is now world-writable. Any user on the system can add or modify accounts, including inserting a root-equivalent entry without a password hash.",
    suggestedActions: [
      "Restore permissions: `chmod 644 /etc/passwd`",
      "Diff /etc/passwd against a known-good copy for unauthorised entries",
      "Audit who changed the permission and when using auth.log",
    ],
  },
};

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);
  if (!(await checkSandboxShowcaseRate(ip))) {
    return jsonError(429, "rate_limited", "Too many requests.", requestId);
  }

  const tenantId = process.env.SANDBOX_SHOWCASE_TENANT_ID?.trim();
  if (!tenantId) {
    return NextResponse.json(
      { status: "unavailable", sandbox: null, recentEvents: [] },
      { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } },
    );
  }

  const { saasSandboxes } = schema;

  const [sandbox] = await withBypassRls((db) =>
    db
      .select({
        id: saasSandboxes.id,
        status: saasSandboxes.status,
        dropletIp: saasSandboxes.dropletIp,
        region: saasSandboxes.region,
        seedPhase: saasSandboxes.seedPhase,
        driftSeededAt: saasSandboxes.driftSeededAt,
        ttlExpiresAt: saasSandboxes.ttlExpiresAt,
        updatedAt: saasSandboxes.updatedAt,
        createdAt: saasSandboxes.createdAt,
      })
      .from(saasSandboxes)
      .where(
        and(
          eq(saasSandboxes.tenantId, tenantId),
          ne(saasSandboxes.status, "destroyed"),
        ),
      )
      .orderBy(desc(saasSandboxes.createdAt))
      .limit(1),
  );

  if (!sandbox) {
    // No active sandbox for the showcase tenant — auto-provision one so the
    // demo page is self-healing without operator intervention.
    //
    // ABUSE GUARD: only one provisioning attempt may run per
    // SHOWCASE_PROVISION_THROTTLE_MS across all IPs.  A unique constraint on
    // saasSandboxes (tenant_id where status != 'destroyed') already caps the
    // worst-case to one Droplet per tenant, but we don't even want to
    // *enqueue* repeat jobs from a bot loop — the queue would fill up and
    // every request would still pay the DB cost.
    if (canKickShowcaseProvision()) {
      try {
        const newId = await provisionSandbox(tenantId);
        await enqueueSandboxProvision(newId, tenantId);
      } catch (err) {
        console.error("[showcase] auto-provision failed", err);
      }
    }
    return NextResponse.json(
      { status: "provisioning", sandbox: null, recentEvents: [] },
      { headers: { "x-request-id": requestId, "Cache-Control": "no-store" } },
    );
  }

  // Build event list from phases applied so far — most recent first.
  // Filter out any findings that match known-benign DO platform services.
  const recentEvents = Array.from(
    { length: sandbox.seedPhase },
    (_, i) => {
      const phase = sandbox.seedPhase - i;
      const scene = SCENE_LABELS[phase];
      if (!scene) return null;
      // Suppress known-benign services that the DO platform installs
      if (KNOWN_BENIGN_SERVICES.has(scene.title.toLowerCase())) return null;
      return { phase, ...scene, detectedAt: sandbox.driftSeededAt };
    },
  ).filter(Boolean);

  const status =
    sandbox.status === "ready" || sandbox.status === "seeding"
      ? "online"
      : "provisioning";

  return NextResponse.json(
    {
      status,
      sandbox: {
        id: sandbox.id,
        status: sandbox.status,
        region: sandbox.region,
        seedPhase: sandbox.seedPhase,
        driftSeededAt: sandbox.driftSeededAt,
        ttlExpiresAt: sandbox.ttlExpiresAt,
        lastSeededAt: sandbox.driftSeededAt ?? sandbox.updatedAt,
      },
      recentEvents,
    },
    {
      headers: {
        "x-request-id": requestId,
        // Short cache — this is live data but polling every few seconds is fine
        "Cache-Control": "no-store",
      },
    },
  );
}
