/**
 * Drift detection engine.
 *
 * Compares two HostSnapshot values and produces typed DriftEvent objects
 * that match the existing UI types exactly.
 */

import type { HostSnapshot } from "./collector";
import type { DriftEvent } from "@/data/mock/types";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// In-process drift event store — file-backed when DRIFT_EVENTS_PATH is set
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__blackglass_drift_events_v1" as const;

type GlobalWithEvents = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, DriftEvent[]>; // hostId → events
};

type SerializedStore = Record<string, DriftEvent[]>;

function storePath(): string | undefined {
  return process.env.DRIFT_EVENTS_PATH;
}

function loadFromFile(filePath: string): Map<string, DriftEvent[]> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const obj = JSON.parse(raw) as SerializedStore;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveToFile(filePath: string, map: Map<string, DriftEvent[]>): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj: SerializedStore = Object.fromEntries(map);
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.error("[drift-engine] Failed to persist:", err);
  }
}

function eventStore(): Map<string, DriftEvent[]> {
  const g = globalThis as GlobalWithEvents;
  if (!g[GLOBAL_KEY]) {
    const fp = storePath();
    g[GLOBAL_KEY] = fp ? loadFromFile(fp) : new Map();
  }
  return g[GLOBAL_KEY];
}

function persist(): void {
  const fp = storePath();
  if (fp) saveToFile(fp, eventStore());
}

export function storeDriftEvents(hostId: string, events: DriftEvent[]): void {
  eventStore().set(hostId, events);
  persist();
}

export function getDriftEvents(hostId?: string): DriftEvent[] {
  const store = eventStore();
  if (hostId) return store.get(hostId) ?? [];
  const all: DriftEvent[] = [];
  for (const evts of store.values()) all.push(...evts);
  return all.sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );
}

export function hasDriftData(): boolean {
  return eventStore().size > 0;
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

function id(prefix: string, suffix: string): string {
  return `${prefix}-${suffix.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 32)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Public: compute drift between two snapshots
// ---------------------------------------------------------------------------

export function computeDrift(
  baseline: HostSnapshot,
  current: HostSnapshot,
): DriftEvent[] {
  const events: DriftEvent[] = [];
  const hostId = current.hostId;

  // --- Network listeners ---
  const baselinePorts = new Set(
    baseline.listeners.map((l) => `${l.proto}:${l.port}`),
  );
  for (const listener of current.listeners) {
    const key = `${listener.proto}:${listener.port}`;
    if (!baselinePorts.has(key)) {
      events.push({
        id: id("drift-port", key),
        hostId,
        category: "network_exposure",
        severity: listener.port < 1024 ? "high" : "medium",
        lifecycle: "new",
        title: `New ${listener.proto.toUpperCase()} listener on port ${listener.port}`,
        detectedAt: now(),
        rationale: `Port ${listener.port} was not present in the captured baseline. New listeners expand attack surface and may indicate a rogue process or misconfiguration.`,
        evidenceSummary: JSON.stringify({
          proto: listener.proto,
          bind: listener.bind,
          port: listener.port,
          process: listener.process ?? "unknown",
          baseline: "not present",
        }),
        suggestedActions: [
          `Verify the process listening on port ${listener.port} is expected`,
          "Update baseline if change is authorised",
          "Check for unauthorised software installation",
        ],
        provenance: {
          collector: "ssh/ss",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // Ports removed from baseline (closed listeners may also be noteworthy)
  const currentPorts = new Set(
    current.listeners.map((l) => `${l.proto}:${l.port}`),
  );
  for (const listener of baseline.listeners) {
    const key = `${listener.proto}:${listener.port}`;
    if (!currentPorts.has(key)) {
      events.push({
        id: id("drift-port-removed", key),
        hostId,
        category: "network_exposure",
        severity: "low",
        lifecycle: "new",
        title: `Baseline listener removed: ${listener.proto.toUpperCase()}/${listener.port}`,
        detectedAt: now(),
        rationale: `Port ${listener.port} was present in the baseline but is no longer listening. This may indicate a service stopped unexpectedly.`,
        evidenceSummary: JSON.stringify({
          proto: listener.proto,
          port: listener.port,
          baselineProcess: listener.process ?? "unknown",
        }),
        suggestedActions: [
          `Verify port ${listener.port} service health`,
          "Update baseline if removal is intentional",
        ],
        provenance: {
          collector: "ssh/ss",
          confidenceLabel: "medium",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // --- Users ---
  const baselineUsers = new Map(
    baseline.users.map((u) => [u.username, u]),
  );
  for (const user of current.users) {
    if (!baselineUsers.has(user.username)) {
      events.push({
        id: id("drift-user", user.username),
        hostId,
        category: "identity",
        severity: "high",
        lifecycle: "new",
        title: `New system user: ${user.username} (uid ${user.uid})`,
        detectedAt: now(),
        rationale: `User account "${user.username}" (UID ${user.uid}) was not present in the baseline. Unauthorized accounts are a primary persistence mechanism.`,
        evidenceSummary: JSON.stringify({
          username: user.username,
          uid: user.uid,
          source: "/etc/passwd",
          baseline: "not present",
        }),
        suggestedActions: [
          `Audit the purpose of account "${user.username}"`,
          "Check for associated SSH keys, crons, and processes",
          "Remove account if not authorised and rotate credentials",
        ],
        provenance: {
          collector: "ssh/passwd",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // --- Sudoers ---
  const baselineSudoers = new Set(baseline.sudoers);
  for (const member of current.sudoers) {
    if (!baselineSudoers.has(member)) {
      events.push({
        id: id("drift-sudo", member),
        hostId,
        category: "identity",
        severity: "high",
        lifecycle: "new",
        title: `Privilege escalation: "${member}" added to sudo group`,
        detectedAt: now(),
        rationale: `"${member}" is in the sudo group but was not in the baseline. Granting sudo access is a high-impact change that must be audited.`,
        evidenceSummary: JSON.stringify({
          user: member,
          group: "sudo",
          baseline: "not a member",
        }),
        suggestedActions: [
          `Confirm with system owner that "${member}" requires sudo`,
          "Review sudoers policy",
          "Revoke if not authorised",
        ],
        provenance: {
          collector: "ssh/getent",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // --- Cron entries ---
  const baselineCron = new Set(baseline.cronEntries.map((c) => c.filename));
  for (const entry of current.cronEntries) {
    if (!baselineCron.has(entry.filename)) {
      events.push({
        id: id("drift-cron", entry.filename),
        hostId,
        category: "persistence",
        severity: "high",
        lifecycle: "new",
        title: `New cron job: /etc/cron.d/${entry.filename}`,
        detectedAt: now(),
        rationale: `Cron file "${entry.filename}" was not in the baseline. Cron jobs are a common persistence mechanism used by attackers.`,
        evidenceSummary: JSON.stringify({
          file: `/etc/cron.d/${entry.filename}`,
          baseline: "not present",
        }),
        suggestedActions: [
          `Inspect /etc/cron.d/${entry.filename} for malicious commands`,
          "Remove if not authorised and audit execution history",
        ],
        provenance: {
          collector: "ssh/cron.d",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // --- SSH config ---
  if (
    baseline.ssh.permitRootLogin !== current.ssh.permitRootLogin &&
    current.ssh.permitRootLogin !== "unknown"
  ) {
    const isRiskier =
      current.ssh.permitRootLogin === "yes" ||
      current.ssh.permitRootLogin === "without-password";
    events.push({
      id: `drift-ssh-root-${hostId}`,
      hostId,
      category: "ssh",
      severity: isRiskier ? "high" : "medium",
      lifecycle: "new",
      title: `SSH PermitRootLogin changed: ${baseline.ssh.permitRootLogin} → ${current.ssh.permitRootLogin}`,
      detectedAt: now(),
      rationale: isRiskier
        ? "Root SSH login is now permitted. Direct root access bypasses sudo logging and increases the blast radius of credential compromise."
        : `PermitRootLogin was set to "${current.ssh.permitRootLogin}" (was "${baseline.ssh.permitRootLogin}").`,
      evidenceSummary: JSON.stringify({
        key: "PermitRootLogin",
        baseline: baseline.ssh.permitRootLogin,
        current: current.ssh.permitRootLogin,
      }),
      suggestedActions: [
        "Review /etc/ssh/sshd_config and revert to baseline value",
        "Rotate root credentials",
        "Audit recent root SSH sessions in auth.log",
      ],
      provenance: {
        collector: "ssh/sshd_config",
        confidenceLabel: "high",
        modelVersion: "drift-engine-v1",
        verifiedAt: now(),
      },
    });
  }

  // --- Firewall ---
  if (baseline.firewall.active && !current.firewall.active) {
    events.push({
      id: `drift-fw-disabled-${hostId}`,
      hostId,
      category: "firewall",
      severity: "high",
      lifecycle: "new",
      title: "Firewall disabled",
      detectedAt: now(),
      rationale:
        "The host firewall (ufw) was active at baseline but is now inactive. All inbound rules are no longer enforced.",
      evidenceSummary: JSON.stringify({
        baseline: "active",
        current: "inactive",
      }),
      suggestedActions: [
        "Re-enable ufw immediately: `sudo ufw enable`",
        "Audit recent inbound connections for unauthorised access",
      ],
      provenance: {
        collector: "ssh/ufw",
        confidenceLabel: "high",
        modelVersion: "drift-engine-v1",
        verifiedAt: now(),
      },
    });
  }

  // --- Services ---
  const baselineSvcs = new Set(baseline.services.map((s) => s.unit));
  for (const svc of current.services) {
    if (!baselineSvcs.has(svc.unit)) {
      events.push({
        id: id("drift-svc", svc.unit),
        hostId,
        category: "persistence",
        severity: "medium",
        lifecycle: "new",
        title: `New running service: ${svc.unit}`,
        detectedAt: now(),
        rationale: `Service "${svc.unit}" is running but was not present in the baseline. New services may represent installed backdoors or misconfigurations.`,
        evidenceSummary: JSON.stringify({
          unit: svc.unit,
          sub: svc.sub,
          baseline: "not present",
        }),
        suggestedActions: [
          `Inspect systemctl status ${svc.unit}`,
          "Check the unit file for suspicious ExecStart commands",
          "Disable and remove if not authorised",
        ],
        provenance: {
          collector: "ssh/systemctl",
          confidenceLabel: "medium",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  return events;
}
