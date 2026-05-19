import { Client, type ConnectConfig } from "ssh2";
import * as net from "node:net";
import type { SshAuthConfig } from "@/lib/server/secrets";
import { normaliseHostId } from "@/lib/server/onboarding/host-id";
import type { HostSnapshot } from "./types";
import {
  parseAuthorizedKeys,
  parseCron,
  parseFileHashes,
  parseFirewall,
  parseHostsEntries,
  parseInstalledPackages,
  parseKernelModules,
  parseListeners,
  parseServices,
  parseSshConfig,
  parseSuidBinaries,
  parseSudoers,
  parseSudoersFiles,
  parseSystemdUnitFiles,
  parseUserCrontabs,
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
    // Use the shared normaliser so SSH-pull and push-agent paths produce
    // identical canonical IDs for the same host.
    hostId: normaliseHostId(host),
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
/** Timeout for the single bundled collection script (all checks sequential in one channel). */
const BUNDLE_EXEC_TIMEOUT_MS = 60_000;

/** Run a single remote command and resolve with its stdout. Rejects on error or after timeoutMs.
 *  When `tolerateNonZeroExit` is true the promise resolves even if the command exits with a
 *  non-zero code — useful for bundled scripts where individual sub-commands may fail. */
function exec(
  conn: Client,
  command: string,
  timeoutMs = EXEC_TIMEOUT_MS,
  tolerateNonZeroExit = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let out = "";
      let errOut = "";
      let exitCode: number | null = null;
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
          reject(new Error(`exec timed out (${timeoutMs / 1000}s): ${command.slice(0, 60)}`));
        });
      }, timeoutMs);
      stream.on("exit", (code: number | null) => {
        exitCode = code;
      });
      stream.on("close", () =>
        settle(() => {
          if (exitCode !== null && exitCode !== 0) {
            // Redact potential credentials from stderr before logging.
            const redacted = errOut
              .replace(/(?:key|password|secret|token)[^\n]{0,120}/gi, "[redacted]")
              .slice(0, 300);
            if (tolerateNonZeroExit) {
              console.warn(
                `[ssh/exec] non-zero exit (${exitCode}): ${command.slice(0, 60)} — stderr: ${redacted}`,
              );
              resolve(out);
            } else {
              console.warn(
                `[ssh/exec] command failed (exit ${exitCode}): ${command.slice(0, 60)} — stderr: ${redacted}`,
              );
              reject(new Error(`exec exited ${exitCode}: ${command.slice(0, 60)}`));
            }
          } else {
            resolve(out);
          }
        }),
      );
      stream.stdout.on("data", (d: Buffer) => {
        out += d.toString();
      });
      stream.stderr.on("data", (d: Buffer) => {
        errOut += d.toString();
      });
    });
  });
}

/**
 * Section separator prefix embedded before each collection check.
 * Chosen to be extremely unlikely to appear in real command output.
 */
const BUNDLE_SEP = "=BGS:" as const;

/**
 * Single bundled shell script that runs all 14 collection checks in one SSH channel.
 *
 * Benefits vs 14 parallel exec() calls:
 *  - Uses 1 SSH channel instead of 14, staying well under sshd MaxSessions (default: 10).
 *  - ~90% reduction in SSH multiplexing overhead on large fleets.
 *  - `timeout` guards on slow commands (systemctl, find) prevent one stalled check
 *    from consuming the entire COLLECTION_TIMEOUT_MS budget.
 *
 * Output format: each section is preceded by a `=BGS:<key>` line; parseBundleOutput()
 * splits it into named strings that are fed directly into the existing parser functions.
 */
const BUNDLE_CMD = `
echo '=BGS:ss'
ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null
echo '=BGS:ssudp'
ss -ulnp 2>/dev/null || netstat -ulnp 2>/dev/null
echo '=BGS:passwd'
awk -F: '$3>=1000 && $3<65534 {print $1 ":" $3}' /etc/passwd 2>/dev/null
echo '=BGS:sudo'
getent group sudo 2>/dev/null || getent group wheel 2>/dev/null
echo '=BGS:sudofiles'
sudo ls /etc/sudoers.d/ 2>/dev/null
echo '=BGS:cron'
ls /etc/cron.d/ 2>/dev/null
echo '=BGS:svc'
timeout 10 systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null
echo '=BGS:sshd'
sudo /usr/sbin/sshd -T 2>/dev/null | grep -iE '^(permitrootlogin|passwordauthentication|permitemptypasswords|x11forwarding|allowtcpforwarding|allowagentforwarding|maxauthtries|port )'
echo '=BGS:ufw'
sudo ufw status verbose 2>/dev/null
echo '=BGS:authkeys'
awk -F: '$7~/bash|sh$/{print $1 ":" $6}' /etc/passwd | while IFS=: read u h; do f="$h/.ssh/authorized_keys"; [ -f "$f" ] && awk -v u="$u" '/^[^#]/{print u ":" $0}' "$f"; done 2>/dev/null
echo '=BGS:filehashes'
md5sum /etc/passwd /etc/shadow /etc/sudoers /etc/ssh/sshd_config /etc/hosts 2>/dev/null
echo '=BGS:hosts'
cat /etc/hosts 2>/dev/null
echo '=BGS:lsmod'
lsmod 2>/dev/null | awk 'NR>1{print $1}' | sort
echo '=BGS:suid'
timeout 20 find /usr /bin /sbin /tmp /var/tmp -perm /6000 -type f 2>/dev/null | sort
echo '=BGS:usercron'
ls /var/spool/cron/crontabs/ 2>/dev/null
echo '=BGS:pkgs'
if command -v dpkg-query >/dev/null 2>&1; then dpkg -l 2>/dev/null | tail -n +6; elif command -v rpm >/dev/null 2>&1; then rpm -qa --qf '%{NAME}|%{VERSION}-%{RELEASE}\n' 2>/dev/null; fi
echo '=BGS:systemdunits'
find /etc/systemd/system -maxdepth 3 \\( -type f -o -type l \\) \\( -name '*.service' -o -name '*.timer' -o -name '*.socket' -o -name '*.path' -o -name '*.mount' \\) 2>/dev/null | sort
`.trim();

/**
 * Parse the concatenated output of BUNDLE_CMD into a map of section-key → content.
 * Each section starts with a `=BGS:<key>` marker line on its own line.
 */
function parseBundleOutput(raw: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = raw.split("\n");
  let key: string | null = null;
  const buf: string[] = [];
  for (const line of lines) {
    if (line.startsWith(BUNDLE_SEP)) {
      if (key !== null) sections[key] = buf.join("\n").trimEnd();
      key = line.slice(BUNDLE_SEP.length).trimEnd();
      buf.length = 0;
    } else if (key !== null) {
      buf.push(line);
    }
  }
  if (key !== null) sections[key] = buf.join("\n").trimEnd();
  return sections;
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
        // All 14 checks run sequentially in one SSH channel via the bundled script.
        // This avoids the ssh2 MaxSessions limit (default: 10) that the original
        // 14-parallel-channel approach would breach on stock sshd configurations.
        const combined = await exec(conn, BUNDLE_CMD, BUNDLE_EXEC_TIMEOUT_MS, true);
        const s = parseBundleOutput(combined);

        settle(() => {
          cleanup();
          conn.end();
          resolve({
            hostId: cfg.hostId,
            hostname: cfg.displayName,
            collectedAt: new Date().toISOString(),
            listeners: [
              ...parseListeners(s["ss"] ?? "", "tcp"),
              ...parseListeners(s["ssudp"] ?? "", "udp"),
            ],
            users: parseUsers(s["passwd"] ?? ""),
            sudoers: parseSudoers(s["sudo"] ?? ""),
            sudoersFiles: parseSudoersFiles(s["sudofiles"] ?? ""),
            cronEntries: parseCron(s["cron"] ?? ""),
            userCrontabs: parseUserCrontabs(s["usercron"] ?? ""),
            services: parseServices(s["svc"] ?? ""),
            ssh: parseSshConfig(s["sshd"] ?? ""),
            firewall: parseFirewall(s["ufw"] ?? ""),
            authorizedKeys: parseAuthorizedKeys(s["authkeys"] ?? ""),
            fileHashes: parseFileHashes(s["filehashes"] ?? ""),
            hostsEntries: parseHostsEntries(s["hosts"] ?? ""),
            kernelModules: parseKernelModules(s["lsmod"] ?? ""),
            suidBinaries: parseSuidBinaries(s["suid"] ?? ""),
            installedPackages: parseInstalledPackages(s["pkgs"] ?? ""),
            systemdUnitFiles: parseSystemdUnitFiles(s["systemdunits"] ?? ""),
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
