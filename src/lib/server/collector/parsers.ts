import type {
  AuthorizedKey,
  CronEntry,
  FileHash,
  FirewallStatus,
  HostsEntry,
  ListeningPort,
  LocalUser,
  RunningService,
  SSHConfig,
} from "./types";

export function parseListeners(raw: string): ListeningPort[] {
  const results: ListeningPort[] = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^LISTEN\s+\d+\s+\d+\s+([\d.*:[\]a-f%\w]+):(\d+)\s/i);
    if (!m) continue;
    const bind = m[1].replace(/^\[/, "").replace(/\]$/, "").replace(/%\w+$/, "");
    const port = parseInt(m[2], 10);
    if (bind.startsWith("127.") || bind === "::1") continue;
    const procM = line.match(/users:\(\("([^"]+)"/);
    results.push({ proto: "tcp", bind, port, process: procM?.[1] });
  }
  return results;
}

export function parseUsers(raw: string): LocalUser[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [username, uid] = l.split(":");
      return { username: username.trim(), uid: parseInt(uid, 10) };
    })
    .filter((u) => !isNaN(u.uid));
}

export function parseSudoers(raw: string): string[] {
  const line = raw.split("\n").find((l) => l.trim().length > 0) ?? "";
  const parts = line.split(":");
  const members = parts[3];
  if (!members) return [];
  return members
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseSudoersFiles(raw: string): string[] {
  return raw
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && f !== "." && f !== "..");
}

export function parseCron(raw: string): CronEntry[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((f) => ({ filename: f.trim() }));
}

export function parseServices(raw: string): RunningService[] {
  const results: RunningService[] = [];
  for (const line of raw.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (!parts[0]?.endsWith(".service")) continue;
    results.push({ unit: parts[0], sub: parts[3] ?? "running" });
  }
  return results;
}

export function parseSshConfig(raw: string): SSHConfig {
  const cfg: SSHConfig = {
    permitRootLogin: "unknown",
    passwordAuthentication: "unknown",
    permitEmptyPasswords: "unknown",
    x11Forwarding: "unknown",
    allowTcpForwarding: "unknown",
    allowAgentForwarding: "unknown",
    maxAuthTries: "unknown",
    port: "unknown",
  };
  for (const line of raw.split("\n")) {
    const lower = line.toLowerCase().trim();
    const val = lower.split(/\s+/)[1] ?? "unknown";
    if (lower.startsWith("permitrootlogin")) cfg.permitRootLogin = val;
    if (lower.startsWith("passwordauthentication")) cfg.passwordAuthentication = val;
    if (lower.startsWith("permitemptypasswords")) cfg.permitEmptyPasswords = val;
    if (lower.startsWith("x11forwarding")) cfg.x11Forwarding = val;
    if (lower.startsWith("allowtcpforwarding")) cfg.allowTcpForwarding = val;
    if (lower.startsWith("allowagentforwarding")) cfg.allowAgentForwarding = val;
    if (lower.startsWith("maxauthtries")) cfg.maxAuthTries = val;
    if (lower.startsWith("port ")) cfg.port = val;
  }
  return cfg;
}

export function parseFirewall(raw: string): FirewallStatus {
  const active = /status: active/i.test(raw);
  const defaultInbound =
    raw.match(/Default:\s+(\w+)\s+\(incoming\)/i)?.[1]?.toLowerCase() ?? "unknown";

  const rules: string[] = [];
  let inRules = false;
  for (const line of raw.split("\n")) {
    // ufw status verbose separator: "--   ------   ----" (dashes + spaces)
    if (/^[-\s]+$/.test(line.trim()) && line.trim().length > 0 && /--/.test(line)) {
      inRules = true;
      continue;
    }
    if (inRules && line.trim().length > 0) {
      rules.push(line.trim());
    }
  }
  return { active, defaultInbound, rules };
}

// ---------------------------------------------------------------------------
// Authorized SSH keys  (format from collector: "user:keytype keydata comment")
// ---------------------------------------------------------------------------

export function parseAuthorizedKeys(raw: string): AuthorizedKey[] {
  const results: AuthorizedKey[] = [];
  for (const line of raw.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const user = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();
    if (!rest || rest.startsWith("#")) continue;
    const parts = rest.split(/\s+/);
    if (parts.length < 2) continue;
    const keyType = parts[0];
    const keyData = parts[1];
    const comment = parts.slice(2).join(" ") || "";
    // Last 16 chars of key material are stable enough to identify a specific key
    const keyFingerprint = keyData.slice(-16);
    results.push({ user, keyType, keyFingerprint, comment });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Critical file hashes  (md5sum output: "hash  /path/to/file")
// ---------------------------------------------------------------------------

export function parseFileHashes(raw: string): FileHash[] {
  const results: FileHash[] = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^([a-f0-9]{32})\s+(.+)$/);
    if (!m) continue;
    results.push({ path: m[2].trim(), hash: m[1] });
  }
  return results;
}

// ---------------------------------------------------------------------------
// /etc/hosts entries
// ---------------------------------------------------------------------------

export function parseHostsEntries(raw: string): HostsEntry[] {
  const results: HostsEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const ip = parts[0];
    const hostnames = parts.slice(1).filter((h) => !h.startsWith("#"));
    if (hostnames.length > 0) results.push({ ip, hostnames });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kernel modules  (lsmod first-column, sorted)
// ---------------------------------------------------------------------------

export function parseKernelModules(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
}

// ---------------------------------------------------------------------------
// SUID/SGID binaries  (find output, one path per line)
// ---------------------------------------------------------------------------

export function parseSuidBinaries(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
}

// ---------------------------------------------------------------------------
// User crontabs  (ls /var/spool/cron/crontabs/, one username per line)
// ---------------------------------------------------------------------------

export function parseUserCrontabs(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
}
