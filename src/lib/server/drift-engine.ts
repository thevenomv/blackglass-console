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
  // Replicate to Postgres when DATABASE_URL is configured so multi-instance
  // deployments and BullMQ workers share drift state.
  if (process.env.DATABASE_URL?.trim()) {
    void import("./store/driftevents-pg")
      .then(({ PostgresDriftEventsRepository: repo }) => repo.store(hostId, events))
      .catch((err) => console.error("[drift-engine] Postgres store failed:", err));
  }
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

/**
 * Async variant — falls back to Postgres when DATABASE_URL is set and the
 * in-memory store is empty (e.g. after a pod restart).  Hydrates memory as a
 * side-effect so subsequent synchronous getDriftEvents() calls also work.
 */
export async function getDriftEventsAsync(hostId?: string): Promise<DriftEvent[]> {
  const store = eventStore();
  const isEmpty = store.size === 0;

  if (isEmpty && process.env.DATABASE_URL?.trim()) {
    try {
      const { PostgresDriftEventsRepository: repo } = await import("./store/driftevents-pg");
      const all = await repo.getAll();
      // Group by hostId and hydrate the in-memory store
      const byHost = new Map<string, DriftEvent[]>();
      for (const evt of all) {
        const list = byHost.get(evt.hostId) ?? [];
        list.push(evt);
        byHost.set(evt.hostId, list);
      }
      for (const [hid, evts] of byHost) {
        store.set(hid, evts);
      }
    } catch (err) {
      console.error("[drift-engine] Postgres hydration failed:", err);
    }
  }

  return getDriftEvents(hostId);
}

export function hasDriftData(): boolean {
  return eventStore().size > 0;
}

/**
 * Async variant of hasDriftData — checks Postgres when memory is empty.
 */
export async function hasDriftDataAsync(): Promise<boolean> {
  if (hasDriftData()) return true;
  if (!process.env.DATABASE_URL?.trim()) return false;
  try {
    const { PostgresDriftEventsRepository: repo } = await import("./store/driftevents-pg");
    return repo.hasAny();
  } catch {
    return false;
  }
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

  // --- Sudoers.d files ---
  const baselineSudoersFiles = new Set(baseline.sudoersFiles ?? []);
  for (const file of current.sudoersFiles ?? []) {
    if (!baselineSudoersFiles.has(file)) {
      events.push({
        id: id("drift-sudoers-file", file),
        hostId,
        category: "identity",
        severity: "high",
        lifecycle: "new",
        title: `New sudoers policy file: /etc/sudoers.d/${file}`,
        detectedAt: now(),
        rationale: `A new file was added to /etc/sudoers.d/ that was not present in the baseline. Sudoers files grant privilege escalation and are a primary persistence mechanism.`,
        evidenceSummary: JSON.stringify({
          file: `/etc/sudoers.d/${file}`,
          baseline: "not present",
        }),
        suggestedActions: [
          `Inspect /etc/sudoers.d/${file} for unauthorised privilege grants`,
          `Remove if not authorised: \`sudo rm /etc/sudoers.d/${file}\``,
          "Audit which users are affected",
        ],
        provenance: {
          collector: "ssh/sudoers.d",
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

  if (
    baseline.ssh.passwordAuthentication !== current.ssh.passwordAuthentication &&
    current.ssh.passwordAuthentication !== "unknown"
  ) {
    const isRiskier = current.ssh.passwordAuthentication === "yes";
    events.push({
      id: `drift-ssh-pw-${hostId}`,
      hostId,
      category: "ssh",
      severity: isRiskier ? "high" : "medium",
      lifecycle: "new",
      title: `SSH PasswordAuthentication changed: ${baseline.ssh.passwordAuthentication} → ${current.ssh.passwordAuthentication}`,
      detectedAt: now(),
      rationale: isRiskier
        ? "SSH password authentication is now enabled. This exposes the host to brute-force and credential-stuffing attacks."
        : `PasswordAuthentication was set to "${current.ssh.passwordAuthentication}" (was "${baseline.ssh.passwordAuthentication}").`,
      evidenceSummary: JSON.stringify({
        key: "PasswordAuthentication",
        baseline: baseline.ssh.passwordAuthentication,
        current: current.ssh.passwordAuthentication,
      }),
      suggestedActions: [
        "Set PasswordAuthentication no in /etc/ssh/sshd_config",
        "Ensure all users have SSH key-based authentication configured",
        "Reload sshd: systemctl reload ssh",
      ],
      provenance: {
        collector: "ssh/sshd_config",
        confidenceLabel: "high",
        modelVersion: "drift-engine-v1",
        verifiedAt: now(),
      },
    });
  }

  // Check additional sshd_config fields that could indicate weakening
  const sshdChecks: Array<{ field: keyof typeof baseline.ssh; label: string; riskyValue: string }> = [
    { field: "permitEmptyPasswords", label: "PermitEmptyPasswords", riskyValue: "yes" },
    { field: "x11Forwarding", label: "X11Forwarding", riskyValue: "yes" },
    { field: "allowTcpForwarding", label: "AllowTcpForwarding", riskyValue: "yes" },
    { field: "allowAgentForwarding", label: "AllowAgentForwarding", riskyValue: "yes" },
  ];
  for (const { field, label, riskyValue } of sshdChecks) {
    const bVal = baseline.ssh[field] ?? "unknown";
    const cVal = current.ssh[field] ?? "unknown";
    if (bVal !== cVal && cVal !== "unknown") {
      const isRiskier = cVal === riskyValue;
      events.push({
        id: `drift-ssh-${field}-${hostId}`,
        hostId,
        category: "ssh",
        severity: isRiskier ? "high" : "medium",
        lifecycle: "new",
        title: `SSH ${label} changed: ${bVal} → ${cVal}`,
        detectedAt: now(),
        rationale: isRiskier
          ? `SSH ${label} was enabled. This weakens the host's SSH security posture.`
          : `SSH ${label} changed from "${bVal}" to "${cVal}".`,
        evidenceSummary: JSON.stringify({ key: label, baseline: bVal, current: cVal }),
        suggestedActions: [
          `Review /etc/ssh/sshd_config — set ${label} to the baseline value`,
          "Reload sshd after changes: systemctl reload ssh",
        ],
        provenance: {
          collector: "ssh/sshd_config",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
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

  // --- Firewall rules (new rules added while firewall stays active) ---
  if (current.firewall.active) {
    const baselineRules = new Set(baseline.firewall.rules.map((r) => r.toLowerCase().trim()));
    for (const rule of current.firewall.rules) {
      const norm = rule.toLowerCase().trim();
      if (!baselineRules.has(norm)) {
        events.push({
          id: id("drift-fw-rule", rule),
          hostId,
          category: "firewall",
          severity: "medium",
          lifecycle: "new",
          title: `New firewall rule: ${rule}`,
          detectedAt: now(),
          rationale:
            "A new inbound firewall rule was added that was not present in the baseline. New rules expand the attack surface by allowing previously blocked traffic.",
          evidenceSummary: JSON.stringify({
            rule,
            baseline: "not present",
          }),
          suggestedActions: [
            `Review the rule: \`sudo ufw status verbose\``,
            `Remove if not authorised: \`sudo ufw delete allow <port>\``,
            "Update baseline if change is intentional",
          ],
          provenance: {
            collector: "ssh/ufw",
            confidenceLabel: "high",
            modelVersion: "drift-engine-v1",
            verifiedAt: now(),
          },
        });
      }
    }
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

  // --- Authorized SSH keys ---
  const baselineKeys = new Set(
    (baseline.authorizedKeys ?? []).map(
      (k) => `${k.user}:${k.keyType}:${k.keyFingerprint}`,
    ),
  );
  for (const key of current.authorizedKeys ?? []) {
    const k = `${key.user}:${key.keyType}:${key.keyFingerprint}`;
    if (!baselineKeys.has(k)) {
      events.push({
        id: id("drift-authkey", `${key.user}-${key.keyFingerprint}`),
        hostId,
        category: "identity",
        severity: "high",
        lifecycle: "new",
        title: `New SSH authorized key for ${key.user}${key.comment ? ` (${key.comment})` : ""}`,
        detectedAt: now(),
        rationale: `An SSH authorized key was added to the "${key.user}" account that was not present in the baseline. This grants the holder persistent SSH access without needing a password.`,
        evidenceSummary: JSON.stringify({
          user: key.user,
          keyType: key.keyType,
          comment: key.comment,
          fingerprintSuffix: key.keyFingerprint,
          baseline: "not present",
        }),
        suggestedActions: [
          `Inspect ~/.ssh/authorized_keys for user "${key.user}"`,
          "Remove the key if not authorised",
          "Audit recent SSH logins: last, journalctl -u ssh",
          "Rotate all credentials for this user",
        ],
        provenance: {
          collector: "ssh/authorized_keys",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // Also detect removed keys (attacker clearing tracks after access)
  const currentKeys = new Set(
    (current.authorizedKeys ?? []).map(
      (k) => `${k.user}:${k.keyType}:${k.keyFingerprint}`,
    ),
  );
  for (const key of baseline.authorizedKeys ?? []) {
    const k = `${key.user}:${key.keyType}:${key.keyFingerprint}`;
    if (!currentKeys.has(k)) {
      events.push({
        id: id("drift-authkey-removed", `${key.user}-${key.keyFingerprint}`),
        hostId,
        category: "identity",
        severity: "medium",
        lifecycle: "new",
        title: `SSH authorized key removed for ${key.user}${key.comment ? ` (${key.comment})` : ""}`,
        detectedAt: now(),
        rationale: `An SSH authorized key was removed from the "${key.user}" account. This may indicate an attacker removing their own key to cover tracks, or a legitimate key rotation.`,
        evidenceSummary: JSON.stringify({
          user: key.user,
          keyType: key.keyType,
          comment: key.comment,
          fingerprintSuffix: key.keyFingerprint,
        }),
        suggestedActions: [
          "Confirm whether key removal was authorised",
          "Update baseline if change is intentional",
          "Audit recent SSH logins: last, journalctl -u ssh",
        ],
        provenance: {
          collector: "ssh/authorized_keys",
          confidenceLabel: "medium",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // --- Critical file integrity (hash changes) ---
  const baselineHashes = new Map(
    (baseline.fileHashes ?? []).map((h) => [h.path, h.hash]),
  );
  for (const fh of current.fileHashes ?? []) {
    const baseHash = baselineHashes.get(fh.path);
    if (baseHash && baseHash !== fh.hash) {
      const isCritical =
        fh.path.includes("shadow") || fh.path.includes("sudoers");
      events.push({
        id: id("drift-filehash", fh.path),
        hostId,
        category: "integrity",
        severity: isCritical ? "high" : "medium",
        lifecycle: "new",
        title: `Critical file modified: ${fh.path}`,
        detectedAt: now(),
        rationale: `The MD5 hash of "${fh.path}" has changed since the baseline was captured. Direct modification of this file may indicate privilege escalation, account backdooring, or SSH config weakening.`,
        evidenceSummary: JSON.stringify({
          path: fh.path,
          baselineHash: baseHash,
          currentHash: fh.hash,
        }),
        suggestedActions: [
          `Inspect changes: diff <(cat baseline) <(cat ${fh.path})`,
          "Check file modification time: stat " + fh.path,
          "Audit recent auth activity in /var/log/auth.log",
          "Update baseline if change is authorised",
        ],
        provenance: {
          collector: "ssh/md5sum",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // --- /etc/hosts tampering ---
  const baselineHosts = new Set(
    (baseline.hostsEntries ?? []).map(
      (e) => `${e.ip} ${e.hostnames.join(" ")}`,
    ),
  );
  for (const entry of current.hostsEntries ?? []) {
    const key = `${entry.ip} ${entry.hostnames.join(" ")}`;
    if (!baselineHosts.has(key)) {
      events.push({
        id: id("drift-hosts", key),
        hostId,
        category: "network_exposure",
        severity: "high",
        lifecycle: "new",
        title: `New /etc/hosts entry: ${entry.ip} → ${entry.hostnames.join(", ")}`,
        detectedAt: now(),
        rationale: `/etc/hosts was modified to map ${entry.hostnames.join(", ")} to ${entry.ip}. This can redirect DNS resolution for critical domains, enabling supply-chain attacks, update hijacking, or lateral movement.`,
        evidenceSummary: JSON.stringify({
          ip: entry.ip,
          hostnames: entry.hostnames,
          baseline: "not present",
        }),
        suggestedActions: [
          "Inspect /etc/hosts for unauthorised entries",
          `Remove the entry: ${entry.ip} ${entry.hostnames.join(" ")}`,
          "Audit network connections to that IP",
          "Check if any package updates were run while this entry was active",
        ],
        provenance: {
          collector: "ssh/hosts",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // --- SUID/SGID binaries ---
  const baselineSuid = new Set(baseline.suidBinaries ?? []);
  for (const bin of current.suidBinaries ?? []) {
    if (!baselineSuid.has(bin)) {
      events.push({
        id: id("drift-suid", bin),
        hostId,
        category: "privilege_escalation",
        severity: "high",
        lifecycle: "new",
        title: `New SUID/SGID binary: ${bin}`,
        detectedAt: now(),
        rationale: `A new binary with SUID or SGID permissions was found at "${bin}" that was not in the baseline. SUID binaries allow any user to execute the file as the file's owner (often root), enabling privilege escalation.`,
        evidenceSummary: JSON.stringify({
          path: bin,
          baseline: "not present",
        }),
        suggestedActions: [
          `Inspect the binary: ls -la ${bin} && file ${bin}`,
          `Remove SUID bit if not authorised: chmod -s ${bin}`,
          "Check if binary is a copy of a shell: file " + bin,
          "Audit recent privilege-escalation events in auth.log",
        ],
        provenance: {
          collector: "ssh/find-suid",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // --- Kernel modules ---
  const baselineMods = new Set(baseline.kernelModules ?? []);
  for (const mod of current.kernelModules ?? []) {
    if (!baselineMods.has(mod)) {
      events.push({
        id: id("drift-kmod", mod),
        hostId,
        category: "integrity",
        severity: "high",
        lifecycle: "new",
        title: `New kernel module loaded: ${mod}`,
        detectedAt: now(),
        rationale: `Kernel module "${mod}" is loaded but was not present in the baseline. Rogue kernel modules are used by rootkits to hide processes, network connections, and files from security tools.`,
        evidenceSummary: JSON.stringify({
          module: mod,
          baseline: "not present",
        }),
        suggestedActions: [
          `Inspect module: modinfo ${mod}`,
          `Check if signed: modinfo ${mod} | grep sig`,
          "If malicious: rmmod " + mod + " (reboot may be required)",
          "Consider a full memory forensics analysis",
        ],
        provenance: {
          collector: "ssh/lsmod",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // --- User crontabs ---
  const baselineCrontabs = new Set(baseline.userCrontabs ?? []);
  for (const user of current.userCrontabs ?? []) {
    if (!baselineCrontabs.has(user)) {
      events.push({
        id: id("drift-usercron", user),
        hostId,
        category: "persistence",
        severity: "medium",
        lifecycle: "new",
        title: `New user crontab: ${user}`,
        detectedAt: now(),
        rationale: `User "${user}" now has a crontab that was not present in the baseline. Crontabs are commonly used for attacker persistence and scheduled command execution.`,
        evidenceSummary: JSON.stringify({
          user,
          path: `/var/spool/cron/crontabs/${user}`,
          baseline: "not present",
        }),
        suggestedActions: [
          `Inspect crontab: crontab -l -u ${user}`,
          `Remove if not authorised: crontab -r -u ${user}`,
          "Check for associated processes spawned by the cron job",
        ],
        provenance: {
          collector: "ssh/crontabs",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  return events;
}
