/**
 * SSH-based system telemetry collector.
 *
 * Required env vars (when NEXT_PUBLIC_USE_MOCK !== "false" is NOT in effect):
 *   COLLECTOR_HOST_1        – IP or hostname of target (e.g. 165.227.229.48)
 *   COLLECTOR_USER          – SSH user   (default: blackglass)
 *   SSH_PRIVATE_KEY         – PEM-encoded private key content
 *
 * All collection happens server-side only; never import this in client code.
 */

import { Client, type ConnectConfig } from "ssh2";

// ---------------------------------------------------------------------------
// Canonical snapshot type produced by one collection run
// ---------------------------------------------------------------------------

export type ListeningPort = {
  proto: "tcp" | "udp";
  bind: string;
  port: number;
  process?: string;
};

export type LocalUser = {
  username: string;
  uid: number;
};

export type RunningService = {
  unit: string;
  sub: string;
};

export type SSHConfig = {
  permitRootLogin: string;
  passwordAuthentication: string;
};

export type FirewallStatus = {
  active: boolean;
  defaultInbound: string;
  rules: string[];
};

export type CronEntry = {
  filename: string;
};

export type HostSnapshot = {
  hostId: string;
  hostname: string;
  collectedAt: string;
  listeners: ListeningPort[];
  users: LocalUser[];
  sudoers: string[];
  cronEntries: CronEntry[];
  services: RunningService[];
  ssh: SSHConfig;
  firewall: FirewallStatus;
};

// ---------------------------------------------------------------------------
// SSH helpers
// ---------------------------------------------------------------------------

function sshConfig(): ConnectConfig & { hostId: string; displayName: string } {
  const host = process.env.COLLECTOR_HOST_1;
  const user = process.env.COLLECTOR_USER ?? "blackglass";
  const privateKey = process.env.SSH_PRIVATE_KEY;

  if (!host) throw new Error("COLLECTOR_HOST_1 env var not set");
  if (!privateKey) throw new Error("SSH_PRIVATE_KEY env var not set");

  // Normalize key: App Platform / CI may store newlines as literal \n or use CRLF.
  const normalizedKey = privateKey
    .replace(/\\n/g, "\n")  // literal \n → real newline
    .replace(/\r\n/g, "\n") // CRLF → LF
    .trim();

  return {
    hostId: `host-${host.replace(/\./g, "-")}`,
    displayName: process.env.COLLECTOR_HOST_1_NAME ?? host,
    host,
    port: Number(process.env.COLLECTOR_PORT ?? 22),
    username: user,
    privateKey: normalizedKey,
    readyTimeout: 15_000,
    // Never prompt; fail fast if key is wrong
    tryKeyboard: false,
  };
}

function exec(conn: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let out = "";
      stream.on("close", () => resolve(out));
      stream.stdout.on("data", (d: Buffer) => {
        out += d.toString();
      });
      // swallow stderr — commands may fail on some distros; we parse what we get
      stream.stderr.on("data", () => {});
    });
  });
}

/** Open one SSH connection, run all collection commands, close. */
async function runCollection(
  cfg: ConnectConfig & { hostId: string; displayName: string },
): Promise<HostSnapshot> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on("error", (e) => {
      conn.end();
      reject(new Error(`SSH connection error: ${e.message}`));
    });

    conn.on("ready", async () => {
      try {
        const [
          ssOut,
          passwdOut,
          sudoOut,
          cronOut,
          svcOut,
          sshdOut,
          ufwOut,
        ] = await Promise.all([
          exec(conn, "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null").catch(
            () => "",
          ),
          exec(
            conn,
            "awk -F: '$3>=1000 && $3<65534 {print $1 \":\" $3}' /etc/passwd 2>/dev/null",
          ).catch(() => ""),
          exec(
            conn,
            "getent group sudo 2>/dev/null || getent group wheel 2>/dev/null",
          ).catch(() => ""),
          exec(conn, "ls /etc/cron.d/ 2>/dev/null").catch(() => ""),
          exec(
            conn,
            "systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null",
          ).catch(() => ""),
          exec(
            conn,
            "sudo /usr/sbin/sshd -T 2>/dev/null | grep -iE '^(permitrootlogin|passwordauthentication)'",
          ).catch(() => ""),
          exec(conn, "sudo ufw status verbose 2>/dev/null").catch(() => ""),
        ]);

        conn.end();

        resolve({
          hostId: cfg.hostId,
          hostname: cfg.displayName,
          collectedAt: new Date().toISOString(),
          listeners: parseListeners(ssOut),
          users: parseUsers(passwdOut),
          sudoers: parseSudoers(sudoOut),
          cronEntries: parseCron(cronOut),
          services: parseServices(svcOut),
          ssh: parseSshConfig(sshdOut),
          firewall: parseFirewall(ufwOut),
        });
      } catch (e) {
        conn.end();
        reject(e);
      }
    });

    try {
      conn.connect(cfg);
    } catch (e) {
      // ssh2 may throw synchronously on key parse failure
      reject(new Error(`SSH connect failed: ${(e as Error).message}`));
    }
  });
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseListeners(raw: string): ListeningPort[] {
  const results: ListeningPort[] = [];
  for (const line of raw.split("\n")) {
    // ss output: State Recv-Q Send-Q Local-Address:Port Peer ...  users:(("proc",pid,fd))
    const m = line.match(/^(?:tcp|udp)\s+LISTEN\s+\d+\s+\d+\s+([\d.*:[\]a-f]+):(\d+)\s/i);
    if (!m) continue;
    const proto = line.startsWith("udp") ? "udp" : "tcp";
    const bind = m[1].replace(/^\[/, "").replace(/\]$/, "");
    const port = parseInt(m[2], 10);
    const procM = line.match(/users:\(\("([^"]+)"/);
    results.push({ proto, bind, port, process: procM?.[1] });
  }
  return results;
}

function parseUsers(raw: string): LocalUser[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [username, uid] = l.split(":");
      return { username: username.trim(), uid: parseInt(uid, 10) };
    })
    .filter((u) => !isNaN(u.uid));
}

function parseSudoers(raw: string): string[] {
  // getent group sudo/wheel: sudo:x:27:user1,user2
  const line = raw.split("\n").find((l) => l.trim().length > 0) ?? "";
  const parts = line.split(":");
  const members = parts[3];
  if (!members) return [];
  return members
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCron(raw: string): CronEntry[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((f) => ({ filename: f.trim() }));
}

function parseServices(raw: string): RunningService[] {
  const results: RunningService[] = [];
  for (const line of raw.split("\n")) {
    // systemctl list-units plain: unit loaded active running description
    const parts = line.trim().split(/\s+/);
    if (!parts[0]?.endsWith(".service")) continue;
    results.push({ unit: parts[0], sub: parts[3] ?? "running" });
  }
  return results;
}

function parseSshConfig(raw: string): SSHConfig {
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

function parseFirewall(raw: string): FirewallStatus {
  const active = /status: active/i.test(raw);
  const defaultInbound =
    raw.match(/Default:\s+(\w+)\s+\(incoming\)/i)?.[1]?.toLowerCase() ??
    "unknown";

  const rules: string[] = [];
  let inRules = false;
  for (const line of raw.split("\n")) {
    if (/^-+$/.test(line.trim())) {
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
// Public API
// ---------------------------------------------------------------------------

/** Returns undefined when COLLECTOR_HOST_1 is not configured. */
export function collectorConfigured(): boolean {
  return Boolean(process.env.COLLECTOR_HOST_1 && process.env.SSH_PRIVATE_KEY);
}

/** Collect a live snapshot from the configured host. Throws on SSH error. */
const COLLECTION_TIMEOUT_MS = 20_000;

export async function collectSnapshot(): Promise<HostSnapshot> {
  const cfg = sshConfig();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`SSH collection timed out after ${COLLECTION_TIMEOUT_MS / 1000}s`)),
      COLLECTION_TIMEOUT_MS,
    ),
  );
  return Promise.race([runCollection(cfg), timeout]);
}
