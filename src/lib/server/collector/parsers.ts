import type {
  CronEntry,
  FirewallStatus,
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
  };
  for (const line of raw.split("\n")) {
    const lower = line.toLowerCase().trim();
    if (lower.startsWith("permitrootlogin")) {
      cfg.permitRootLogin = lower.split(/\s+/)[1] ?? "unknown";
    }
    if (lower.startsWith("passwordauthentication")) {
      cfg.passwordAuthentication = lower.split(/\s+/)[1] ?? "unknown";
    }
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
