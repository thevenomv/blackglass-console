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
  parseSudoersFiles,
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
    readyTimeout: 10_000,
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

const EXEC_TIMEOUT_MS = 8_000;

/** Run a single remote command and resolve with its stdout. Rejects on error or after EXEC_TIMEOUT_MS. */
function exec(conn: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let out = "";
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        settle(() => {
          stream.close();
          reject(new Error(`exec timed out (${EXEC_TIMEOUT_MS / 1000}s): ${command.slice(0, 60)}`));
        });
      }, EXEC_TIMEOUT_MS);
      stream.on("close", () => settle(() => resolve(out)));
      stream.stdout.on("data", (d: Buffer) => { out += d.toString(); });
      stream.stderr.on("data", () => {});
    });
  });
}

/** Probe TCP connectivity before SSH to give clearer error messages.
 *  `signal` lets the caller abort mid-connect (e.g. when the collection AbortController fires). */
function probeTcp(host: string, port: number, timeoutMs = 4_000, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("TCP probe aborted")); return; }

    const socket = net.createConnection({ host, port });
    let settled = false;
    const settle = (fn: () => void) => { if (settled) return; settled = true; fn(); };

    // Hard deadline — fires whether the socket emits timeout or not.
    const timer = setTimeout(() => {
      settle(() => { socket.destroy(); reject(new Error(`TCP connect to ${host}:${port} timed out`)); });
    }, timeoutMs);

    const onAbort = () => settle(() => { clearTimeout(timer); socket.destroy(); reject(new Error("TCP probe aborted")); });
    signal?.addEventListener("abort", onAbort, { once: true });

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => settle(() => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); socket.destroy(); resolve(); }));
    socket.on("timeout", () => settle(() => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); socket.destroy(); reject(new Error(`TCP connect to ${host}:${port} timed out`)); }));
    socket.on("error", (e) => settle(() => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); reject(new Error(`TCP connect to ${host}:${port} failed: ${e.message}`)); }));
  });
}

/** Open one SSH connection, run all collection commands, close.
 *  Pass an AbortSignal to destroy the connection if the caller times out.
 */
export async function runCollection(
  cfg: ConnectConfig & { hostId: string; displayName: string },
  signal?: AbortSignal,
): Promise<HostSnapshot> {
  if (signal?.aborted) throw new Error("Collection aborted before TCP probe");

  // First verify TCP connectivity to give a clear error if networking is blocked.
  // Pass the AbortSignal so a collection-level abort cancels the probe immediately.
  await probeTcp(cfg.host as string, (cfg.port as number) ?? 22, 4_000, signal);

  if (signal?.aborted) throw new Error("Collection aborted after TCP probe");

  return new Promise((resolve, reject) => {
    const conn = new Client();

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    // Called by caller's AbortSignal — destroy the live connection.
    const onAbort = () => {
      settle(() => {
        conn.destroy();
        reject(new Error("SSH collection aborted (timeout)"));
      });
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    // ssh2 emits "timeout" (not "error") when readyTimeout fires.
    conn.on("timeout", () => {
      settle(() => {
        cleanup();
        conn.destroy();
        reject(new Error("SSH handshake timed out"));
      });
    });

    conn.on("error", (e) => {
      settle(() => {
        cleanup();
        conn.destroy();
        reject(new Error(`SSH connection error: ${e.message}`));
      });
    });

    conn.on("ready", async () => {
      try {
        const [
          ssOut,
          passwdOut,
          sudoOut,
          sudoFilesOut,
          cronOut,
          svcOut,
          sshdOut,
          ufwOut,
        ] = await Promise.all([
          exec(conn, "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null").catch(() => ""),
          exec(conn, "awk -F: '$3>=1000 && $3<65534 {print $1 \":\" $3}' /etc/passwd 2>/dev/null").catch(() => ""),
          exec(conn, "getent group sudo 2>/dev/null || getent group wheel 2>/dev/null").catch(() => ""),
          exec(conn, "sudo ls /etc/sudoers.d/ 2>/dev/null").catch(() => ""),
          exec(conn, "ls /etc/cron.d/ 2>/dev/null").catch(() => ""),
          exec(conn, "systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null").catch(() => ""),
          exec(conn, "sudo /usr/sbin/sshd -T 2>/dev/null | grep -iE '^(permitrootlogin|passwordauthentication)'").catch(() => ""),
          exec(conn, "sudo ufw status verbose 2>/dev/null").catch(() => ""),
        ]);

        settle(() => {
          cleanup();
          conn.end();
          resolve({
            hostId: cfg.hostId,
            hostname: cfg.displayName,
            collectedAt: new Date().toISOString(),
            listeners: parseListeners(ssOut),
            users: parseUsers(passwdOut),
            sudoers: parseSudoers(sudoOut),
            sudoersFiles: parseSudoersFiles(sudoFilesOut),
            cronEntries: parseCron(cronOut),
            services: parseServices(svcOut),
            ssh: parseSshConfig(sshdOut),
            firewall: parseFirewall(ufwOut),
          });
        });
      } catch (e) {
        settle(() => {
          cleanup();
          conn.destroy();
          reject(e);
        });
      }
    });

    try {
      conn.connect(cfg);
    } catch (e) {
      settle(() => {
        cleanup();
        reject(new Error(`SSH connect failed: ${(e as Error).message}`));
      });
    }
  });
}
