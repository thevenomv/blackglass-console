import { Client, type ConnectConfig } from "ssh2";
import * as net from "node:net";
import type { SshAuthConfig } from "@/lib/server/secrets";
import type { HostSnapshot } from "./types";
import {
  parseCron,
  parseFirewall,
  parseListeners,
  parseServices,
  parseSshConfig,
  parseSudoers,
  parseUsers,
} from "./parsers";

function sshAuthFragment(auth: SshAuthConfig): {
  privateKey: string | Buffer;
  publicKey?: string;
} {
  if (auth.mode === "pem") return { privateKey: auth.privateKey };
  return { privateKey: auth.privateKey, publicKey: auth.publicKey };
}

/** IANA-assigned SSH port (RFC 4251). Override per-host via COLLECTOR_HOST_N_PORT or globally via COLLECTOR_PORT. */
const DEFAULT_SSH_PORT = 22;

export function buildSshConfig(
  host: string,
  hostIndex: number,
  auth: SshAuthConfig,
): ConnectConfig & { hostId: string; displayName: string } {
  const user =
    process.env[`COLLECTOR_HOST_${hostIndex}_USER`]?.trim() ||
    process.env.COLLECTOR_USER ||
    "blackglass";
  const portRaw = process.env[`COLLECTOR_HOST_${hostIndex}_PORT`];
  const port =
    portRaw != null && portRaw !== ""
      ? Number(portRaw)
      : Number(process.env.COLLECTOR_PORT ?? DEFAULT_SSH_PORT);

  return {
    hostId: `host-${host.replace(/\./g, "-")}`,
    displayName: process.env[`COLLECTOR_HOST_${hostIndex}_NAME`] ?? host,
    host,
    port: Number.isFinite(port) ? port : DEFAULT_SSH_PORT,
    username: user,
    ...sshAuthFragment(auth),
    readyTimeout: 15_000,
    tryKeyboard: false,
  };
}

/** Returns SSH configs for every configured COLLECTOR_HOST_N (optional hostId filter). */
export function allSshConfigs(
  auth: SshAuthConfig,
  filterHostIds?: string[],
): Array<ConnectConfig & { hostId: string; displayName: string }> {
  const filter =
    filterHostIds && filterHostIds.length > 0 ? new Set(filterHostIds) : null;
  const cfgs = [];
  for (let i = 1; i <= 9; i++) {
    const host = process.env[`COLLECTOR_HOST_${i}`];
    if (!host) break;
    const cfg = buildSshConfig(host, i, auth);
    if (filter && !filter.has(cfg.hostId)) continue;
    cfgs.push(cfg);
  }
  return cfgs;
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
      stream.stderr.on("data", () => {});
    });
  });
}

/** Probe TCP connectivity before SSH to give clearer error messages. */
function probeTcp(host: string, port: number, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => { socket.destroy(); resolve(); });
    socket.on("timeout", () => { socket.destroy(); reject(new Error(`TCP connect to ${host}:${port} timed out`)); });
    socket.on("error", (e) => reject(new Error(`TCP connect to ${host}:${port} failed: ${e.message}`)));
  });
}

/** Open one SSH connection, run all collection commands, close. */
export async function runCollection(
  cfg: ConnectConfig & { hostId: string; displayName: string },
): Promise<HostSnapshot> {
  // First verify TCP connectivity to give a clear error if networking is blocked.
  await probeTcp(cfg.host as string, (cfg.port as number) ?? 22);

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
      reject(new Error(`SSH connect failed: ${(e as Error).message}`));
    }
  });
}
