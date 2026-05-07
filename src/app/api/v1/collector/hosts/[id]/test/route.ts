/**
 * POST /api/v1/collector/hosts/[id]/test — connectivity smoke test.
 *
 * Runs a minimal check against the host: TCP probe, SSH handshake, and a
 * single `whoami; uname -sr` command. Returns the captured stdout (or a
 * structured error message) so the operator can debug connection issues
 * without waiting on a full drift scan.
 *
 * Hard-capped at 20 s wall-clock so a hung host can't block the request
 * worker. Audit-logged like every other host mutation.
 */

import type { ConnectConfig } from "ssh2";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { requireSaasStepUpMutation } from "@/lib/server/http/saas-access";
import { withTenantRls, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { canRunScansForTenant } from "@/lib/saas/operations";
import { runWithCollectorCredential, type SshAuthConfig } from "@/lib/server/secrets";
import * as net from "node:net";

export const dynamic = "force-dynamic";

const { saasCollectorHosts } = schema;

type Params = { params: Promise<{ id: string }> };

const TEST_BUDGET_MS = 20_000;
const TCP_BUDGET_MS = 4_000;
const SSH_HANDSHAKE_BUDGET_MS = 10_000;

function probeTcp(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const timer = setTimeout(() => {
      settle(() => {
        socket.destroy();
        reject(new Error(`TCP connect to ${host}:${port} timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => settle(() => { clearTimeout(timer); socket.destroy(); resolve(); }));
    socket.on("timeout", () => settle(() => { clearTimeout(timer); socket.destroy(); reject(new Error(`TCP connect to ${host}:${port} timed out`)); }));
    socket.on("error", (e) => settle(() => { clearTimeout(timer); reject(new Error(`TCP connect failed: ${e.message}`)); }));
  });
}

function sshAuthFragment(auth: SshAuthConfig): { privateKey: string | Buffer; publicKey?: string } {
  if (auth.mode === "pem") return { privateKey: auth.privateKey };
  return { privateKey: auth.privateKey, publicKey: auth.publicKey };
}

async function runOneShot(
  cfg: ConnectConfig,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const { Client } = await import("ssh2");
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const settle = (fn: () => void) => { if (settled) return; settled = true; fn(); };

    const timer = setTimeout(() => {
      settle(() => { conn.destroy(); reject(new Error("Test command exceeded 20s budget")); });
    }, TEST_BUDGET_MS);

    conn.on("ready", () => {
      // `whoami` proves auth + session; `uname -sr` confirms the kernel
      // we'd be collecting against. `id` shows whether sudo will work.
      conn.exec("whoami; uname -sr; id 2>/dev/null", (err, stream) => {
        if (err) {
          settle(() => { clearTimeout(timer); conn.destroy(); reject(err); });
          return;
        }
        let stdout = "";
        let stderr = "";
        stream
          .on("close", (code: number | null) => {
            settle(() => {
              clearTimeout(timer);
              conn.end();
              resolve({ stdout, stderr, exitCode: code });
            });
          })
          .on("data", (d: Buffer) => { stdout += d.toString(); })
          .stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      });
    });
    conn.on("error", (e) => settle(() => { clearTimeout(timer); reject(new Error(`SSH error: ${e.message}`)); }));
    conn.on("timeout", () => settle(() => { clearTimeout(timer); conn.destroy(); reject(new Error("SSH handshake timed out")); }));
    conn.connect(cfg);
  });
}

interface TestResult {
  ok: boolean;
  durationMs: number;
  stages: {
    tcp: { ok: boolean; durationMs: number; error?: string };
    ssh: { ok: boolean; durationMs: number; error?: string };
    exec: { ok: boolean; durationMs: number; error?: string; stdout?: string; stderr?: string };
  };
  /** A short human-readable summary for the toast. */
  summary: string;
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const requestId = getOrCreateRequestId(request);

  const access = await requireSaasStepUpMutation("hosts.manage", canRunScansForTenant);
  if (!access.ok) return access.response;
  const { ctx } = access;

  const [host] = await withTenantRls(ctx.tenant.id, (db) =>
    db
      .select()
      .from(saasCollectorHosts)
      .where(and(eq(saasCollectorHosts.id, id), eq(saasCollectorHosts.tenantId, ctx.tenant.id))),
  );

  if (!host) return jsonError(404, "not_found", "Host not found.", requestId);

  const overallStart = Date.now();
  const result: TestResult = {
    ok: false,
    durationMs: 0,
    stages: {
      tcp: { ok: false, durationMs: 0 },
      ssh: { ok: false, durationMs: 0 },
      exec: { ok: false, durationMs: 0 },
    },
    summary: "",
  };

  // Stage 1: TCP
  const tcpStart = Date.now();
  try {
    await probeTcp(host.hostname, host.sshPort, TCP_BUDGET_MS);
    result.stages.tcp = { ok: true, durationMs: Date.now() - tcpStart };
  } catch (err) {
    result.stages.tcp = {
      ok: false,
      durationMs: Date.now() - tcpStart,
      error: err instanceof Error ? err.message : String(err),
    };
    result.durationMs = Date.now() - overallStart;
    result.summary = "TCP probe failed — check the IP / port / network firewall.";
    await emitTestAudit(ctx.tenant.id, ctx.userId, host.id, host.hostname, result);
    return jsonWithRequestId(result, requestId);
  }

  // Stage 2 + 3: load credential, attempt SSH + exec
  try {
    await runWithCollectorCredential(
      {
        scanId: `host-test-${id}`,
        reason: "drift_scan",
        hostCount: 1,
        tenantId: ctx.tenant.id,
      },
      async (auth) => {
        const sshStart = Date.now();
        const cfg: ConnectConfig = {
          host: host.hostname,
          port: host.sshPort,
          username: host.sshUser,
          ...sshAuthFragment(auth),
          readyTimeout: SSH_HANDSHAKE_BUDGET_MS,
          tryKeyboard: false,
        };
        try {
          const out = await runOneShot(cfg);
          result.stages.ssh = { ok: true, durationMs: Date.now() - sshStart };
          result.stages.exec = {
            ok: out.exitCode === 0,
            durationMs: Date.now() - sshStart,
            stdout: out.stdout.slice(0, 1000),
            stderr: out.stderr.slice(0, 500),
            ...(out.exitCode !== 0 ? { error: `Exit code ${out.exitCode}` } : {}),
          };
        } catch (err) {
          // Distinguish handshake vs exec failure by elapsed time vs SSH budget.
          const elapsed = Date.now() - sshStart;
          const msg = err instanceof Error ? err.message : String(err);
          if (elapsed < SSH_HANDSHAKE_BUDGET_MS && /SSH error|handshake|authentication/i.test(msg)) {
            result.stages.ssh = { ok: false, durationMs: elapsed, error: msg };
          } else {
            result.stages.ssh = { ok: true, durationMs: elapsed };
            result.stages.exec = { ok: false, durationMs: elapsed, error: msg };
          }
        }
      },
    );
  } catch (err) {
    result.stages.ssh = {
      ok: false,
      durationMs: Date.now() - tcpStart,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  result.durationMs = Date.now() - overallStart;
  result.ok = result.stages.tcp.ok && result.stages.ssh.ok && result.stages.exec.ok;
  result.summary = result.ok
    ? "Connection healthy — collector ready to scan this host."
    : !result.stages.ssh.ok
      ? "SSH handshake failed — check credentials and the host's authorized_keys."
      : "Command exec failed — connection succeeded but `whoami` returned an error.";

  await emitTestAudit(ctx.tenant.id, ctx.userId, host.id, host.hostname, result);
  return jsonWithRequestId(result, requestId);
}

async function emitTestAudit(
  tenantId: string,
  actorUserId: string | null,
  hostId: string,
  hostname: string,
  result: TestResult,
): Promise<void> {
  await emitSaasAudit({
    tenantId,
    actorUserId,
    action: "collector_host.tested",
    targetType: "collector_host",
    targetId: hostId,
    metadata: {
      hostname,
      ok: result.ok,
      durationMs: result.durationMs,
      tcp: result.stages.tcp.ok,
      ssh: result.stages.ssh.ok,
      exec: result.stages.exec.ok,
    },
  });
}
