/**
 * computeDrift — pure function that compares two HostSnapshot values and
 * produces a typed list of DriftEvent rows. Owns no state; the storage
 * layer in ./store.ts and ./store-async.ts persists/queries the results.
 */

import type { HostSnapshot } from "../collector";
import type { DriftEvent } from "@/data/mock/types";
import { id, now } from "./helpers";
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

  // Detect users removed since baseline — unexpected account removal can
  // indicate an attacker covering tracks or a misconfiguration.
  const currentUsernames = new Set(current.users.map((u) => u.username));
  for (const [username, user] of baselineUsers) {
    if (!currentUsernames.has(username)) {
      events.push({
        id: id("drift-user-removed", username),
        hostId,
        category: "identity",
        severity: "medium",
        lifecycle: "new",
        title: `System user removed: ${username} (uid ${user.uid})`,
        detectedAt: now(),
        rationale: `User account "${username}" (UID ${user.uid}) was present in the baseline but no longer exists. Unexpected account removal may indicate an attacker covering tracks or a misconfiguration.`,
        evidenceSummary: JSON.stringify({
          username,
          uid: user.uid,
          source: "/etc/passwd",
          current: "not present",
        }),
        suggestedActions: [
          `Confirm the removal of account "${username}" was authorised`,
          "Check audit logs for who deleted the account",
          "Update baseline if removal is intentional",
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

  // Detect sudo members removed since baseline.
  const currentSudoersSet = new Set(current.sudoers);
  for (const member of baselineSudoers) {
    if (!currentSudoersSet.has(member)) {
      events.push({
        id: id("drift-sudo-removed", member),
        hostId,
        category: "identity",
        severity: "medium",
        lifecycle: "new",
        title: `Sudo membership removed: "${member}" no longer in sudo group`,
        detectedAt: now(),
        rationale: `"${member}" was in the sudo group at baseline but is no longer a member. This may be intentional hardening or could indicate account manipulation.`,
        evidenceSummary: JSON.stringify({
          user: member,
          group: "sudo",
          current: "not a member",
        }),
        suggestedActions: [
          `Confirm the sudo removal of "${member}" was authorised`,
          "Check audit logs for membership changes",
          "Update baseline if removal is intentional",
        ],
        provenance: {
          collector: "ssh/getent",
          confidenceLabel: "medium",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // --- Sudoers.d files ---
  const baselineSudoersFiles = new Set(baseline.sudoersFiles ?? []);
  const currentSudoersFiles = new Set(current.sudoersFiles ?? []);
  for (const file of baselineSudoersFiles) {
    if (!currentSudoersFiles.has(file)) {
      events.push({
        id: id("drift-sudoers-file-removed", file),
        hostId,
        category: "identity",
        severity: "medium",
        lifecycle: "new",
        title: `Sudoers policy file removed: /etc/sudoers.d/${file}`,
        detectedAt: now(),
        rationale: `A sudoers file present in the baseline is no longer on disk. Removal could be intentional cleanup, or an attacker covering tracks after using a temporary delegation.`,
        evidenceSummary: JSON.stringify({
          file: `/etc/sudoers.d/${file}`,
          current: "not present",
        }),
        suggestedActions: [
          "Confirm the removal was intentional",
          "Check auth.log around the removal time for who ran sudo or modified /etc/sudoers.d/",
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
  const currentCron = new Set(current.cronEntries.map((c) => c.filename));
  for (const filename of baselineCron) {
    if (!currentCron.has(filename)) {
      events.push({
        id: id("drift-cron-removed", filename),
        hostId,
        category: "persistence",
        severity: "medium",
        lifecycle: "new",
        title: `Cron job removed: /etc/cron.d/${filename}`,
        detectedAt: now(),
        rationale: `Cron file "${filename}" was present in the baseline but is no longer on disk. Removal can indicate an attacker cleaning up a planted job after first execution, or scheduled-task hygiene.`,
        evidenceSummary: JSON.stringify({
          file: `/etc/cron.d/${filename}`,
          current: "not present",
        }),
        suggestedActions: [
          "Confirm the removal was intentional",
          "Audit syslog for execution evidence: `journalctl --since=<baseline-date> | grep " + filename + "`",
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

  if (!baseline.firewall.active && current.firewall.active) {
    events.push({
      id: `drift-fw-enabled-${hostId}`,
      hostId,
      category: "firewall",
      severity: "medium",
      lifecycle: "new",
      title: "Firewall re-enabled",
      detectedAt: now(),
      rationale:
        "The host firewall (ufw) was inactive at baseline but is now active. Verify that the rule set is correct and that the change was intentional.",
      evidenceSummary: JSON.stringify({
        baseline: "inactive",
        current: "active",
      }),
      suggestedActions: [
        "Review current rules: `sudo ufw status verbose`",
        "Update baseline if the change is intentional",
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
    } else if (baseHash === undefined) {
      // New file in a watched path that was not present at baseline capture.
      const isCritical =
        fh.path.includes("shadow") || fh.path.includes("sudoers");
      events.push({
        id: id("drift-filehash-new", fh.path),
        hostId,
        category: "integrity",
        severity: isCritical ? "high" : "medium",
        lifecycle: "new",
        title: `New critical file appeared: ${fh.path}`,
        detectedAt: now(),
        rationale: `"${fh.path}" was not present in the baseline but is now tracked. Unexpected new files in sensitive paths may indicate privilege escalation or configuration injection.`,
        evidenceSummary: JSON.stringify({
          path: fh.path,
          currentHash: fh.hash,
          baseline: "not present",
        }),
        suggestedActions: [
          `Verify the file is expected: ls -la ${fh.path}`,
          "Check who created it: stat " + fh.path,
          "Update baseline if the file is authorised",
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
  const currentSuid = new Set(current.suidBinaries ?? []);
  for (const bin of baselineSuid) {
    if (!currentSuid.has(bin)) {
      events.push({
        id: id("drift-suid-removed", bin),
        hostId,
        category: "privilege_escalation",
        severity: "low",
        lifecycle: "new",
        title: `SUID/SGID binary removed: ${bin}`,
        detectedAt: now(),
        rationale: `A binary with SUID/SGID permissions present in the baseline is no longer on disk. Removal can indicate hardening, or an attacker cleaning up a planted privilege-escalation tool.`,
        evidenceSummary: JSON.stringify({
          path: bin,
          current: "not present",
        }),
        suggestedActions: [
          "Confirm the removal was intentional (hardening) or expected (package uninstall)",
          "If unexpected, audit recent file deletions and shell history",
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
  const currentMods = new Set(current.kernelModules ?? []);
  for (const mod of baselineMods) {
    if (!currentMods.has(mod)) {
      events.push({
        id: id("drift-kmod-removed", mod),
        hostId,
        category: "integrity",
        severity: "medium",
        lifecycle: "new",
        title: `Kernel module unloaded: ${mod}`,
        detectedAt: now(),
        rationale: `Kernel module "${mod}" was loaded in the baseline but is no longer present. Modules rarely unload spontaneously — investigate whether a security module was disabled or a rootkit cleaned up after itself.`,
        evidenceSummary: JSON.stringify({
          module: mod,
          current: "not loaded",
        }),
        suggestedActions: [
          "Confirm whether the unload was intentional",
          "Check dmesg for module unload events: `dmesg -T | grep " + mod + "`",
          "If a security module (audit, apparmor, selinux), re-enable immediately",
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

  // --- Installed packages (apt/dpkg or rpm) ---
  // Three change classes worth surfacing:
  //   - new package      (medium — could be authorised install or ad-hoc)
  //   - removed package  (low    — typically intentional cleanup)
  //   - version change   (medium — patch / supply-chain interest)
  const baselinePkgs = new Map(
    (baseline.installedPackages ?? []).map((p) => [p.name, p.version]),
  );
  const currentPkgs = new Map(
    (current.installedPackages ?? []).map((p) => [p.name, p.version]),
  );

  for (const [name, version] of currentPkgs) {
    const prev = baselinePkgs.get(name);
    if (prev === undefined) {
      events.push({
        id: id("drift-pkg-added", `${name}-${version}`),
        hostId,
        category: "packages",
        severity: "medium",
        lifecycle: "new",
        title: `Package installed: ${name} (${version || "no version"})`,
        detectedAt: now(),
        rationale: `Package "${name}" was not present in the baseline. Newly installed packages can introduce new code paths, network listeners, and supply-chain risk.`,
        evidenceSummary: JSON.stringify({
          name,
          version,
          baseline: "not present",
        }),
        suggestedActions: [
          `Verify the install was authorised: \`apt-get install --simulate ${name}\` shows the dependency tree`,
          "Check who installed it: `last`, `journalctl _COMM=apt`",
          "Update the baseline if the install is approved",
        ],
        provenance: {
          collector: "ssh/dpkg|rpm",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    } else if (prev !== version) {
      events.push({
        id: id("drift-pkg-version", `${name}-${version}`),
        hostId,
        category: "packages",
        severity: "medium",
        lifecycle: "new",
        title: `Package version changed: ${name} (${prev} → ${version})`,
        detectedAt: now(),
        rationale: `Package "${name}" was upgraded or downgraded since the baseline. Version changes commonly land via patching or out-of-band ad-hoc installs.`,
        evidenceSummary: JSON.stringify({
          name,
          baselineVersion: prev,
          currentVersion: version,
        }),
        suggestedActions: [
          `Inspect the change: \`apt list --installed | grep ${name}\` or \`rpm -q --info ${name}\``,
          "Confirm the upgrade matches a scheduled patch window",
          "Update the baseline if the change is intentional",
        ],
        provenance: {
          collector: "ssh/dpkg|rpm",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  for (const [name, version] of baselinePkgs) {
    if (!currentPkgs.has(name)) {
      events.push({
        id: id("drift-pkg-removed", `${name}-${version}`),
        hostId,
        category: "packages",
        severity: "low",
        lifecycle: "new",
        title: `Package removed: ${name} (was ${version || "unknown"})`,
        detectedAt: now(),
        rationale: `Package "${name}" was present in the baseline but is no longer installed. Surface for visibility — usually intentional cleanup, but worth confirming.`,
        evidenceSummary: JSON.stringify({
          name,
          baselineVersion: version,
          current: "not installed",
        }),
        suggestedActions: [
          "Confirm the removal was intentional",
          "Update the baseline if it was",
        ],
        provenance: {
          collector: "ssh/dpkg|rpm",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  // --- User crontabs ---
  const baselineCrontabs = new Set(baseline.userCrontabs ?? []);
  const currentCrontabs = new Set(current.userCrontabs ?? []);
  for (const user of baselineCrontabs) {
    if (!currentCrontabs.has(user)) {
      events.push({
        id: id("drift-usercron-removed", user),
        hostId,
        category: "persistence",
        severity: "low",
        lifecycle: "new",
        title: `User crontab removed: ${user}`,
        detectedAt: now(),
        rationale: `User "${user}" had a crontab in the baseline that no longer exists. Could indicate intentional cleanup, or an attacker covering tracks after a planted job ran.`,
        evidenceSummary: JSON.stringify({
          user,
          path: `/var/spool/cron/crontabs/${user}`,
          current: "not present",
        }),
        suggestedActions: [
          "Confirm the removal was intentional",
          `Check shell history for the user: \`last ${user}\` and \`cat ~${user}/.bash_history\``,
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

  // --- Systemd unit files on disk (under /etc/systemd/system) ---
  // We track admin-installed units and wants/* enable-symlinks specifically;
  // /usr/lib/* is intentionally excluded because it churns with package updates
  // and would duplicate the package drift signal.
  const baselineUnits = new Set(baseline.systemdUnitFiles ?? []);
  const currentUnits = new Set(current.systemdUnitFiles ?? []);
  for (const path of baselineUnits) {
    if (!currentUnits.has(path)) {
      events.push({
        id: id("drift-systemd-removed", path),
        hostId,
        category: "persistence",
        severity: "low",
        lifecycle: "new",
        title: `Systemd unit file removed: ${path}`,
        detectedAt: now(),
        rationale: `A systemd unit (or enable-symlink) under /etc/systemd/system that was present in the baseline is no longer on disk. Removal is usually intentional cleanup but can also indicate an attacker disabling a security service.`,
        evidenceSummary: JSON.stringify({
          path: `/etc/systemd/system/${path}`,
          current: "not present",
        }),
        suggestedActions: [
          "Confirm the removal was intentional (uninstall, hardening pass)",
          `Check journal for the unit: journalctl -u ${path.split("/").pop() ?? path} --since=<baseline>`,
          "If a security daemon (auditd, falco, osquery, etc.), re-enable immediately",
        ],
        provenance: {
          collector: "ssh/systemd-files",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }
  for (const path of current.systemdUnitFiles ?? []) {
    if (!baselineUnits.has(path)) {
      // wants/*.* symlinks (enable a unit) get a slightly different framing
      // from raw .service / .timer files (define a unit). Both are interesting
      // but distinguishing them in the title speeds triage.
      const isEnableLink = path.includes(".wants/");
      events.push({
        id: id("drift-systemd", path),
        hostId,
        category: "persistence",
        severity: isEnableLink ? "medium" : "high",
        lifecycle: "new",
        title: isEnableLink
          ? `Systemd unit enabled: ${path}`
          : `New systemd unit on disk: ${path}`,
        detectedAt: now(),
        rationale: isEnableLink
          ? `A wants/*.* enable-symlink appeared under /etc/systemd/system that was not present in the baseline — a previously-installed unit just got enabled. Common for legitimate \`systemctl enable\` calls, also a classic attacker persistence step.`
          : `A new systemd unit file appeared under /etc/systemd/system that was not in the baseline. Custom units in this directory bypass package management and are the standard way an attacker establishes persistence on a modern Linux host.`,
        evidenceSummary: JSON.stringify({
          path: `/etc/systemd/system/${path}`,
          baseline: "not present",
        }),
        suggestedActions: [
          `Inspect: systemctl cat ${path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path}`,
          "Confirm the install matches a deploy / config-mgmt run",
          isEnableLink
            ? "Disable if unauthorised: systemctl disable <unit>"
            : "Remove if unauthorised: rm /etc/systemd/system/" + path + " && systemctl daemon-reload",
        ],
        provenance: {
          collector: "ssh/systemd-files",
          confidenceLabel: "high",
          modelVersion: "drift-engine-v1",
          verifiedAt: now(),
        },
      });
    }
  }

  return events;
}
