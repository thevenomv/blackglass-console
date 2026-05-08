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
 *
 * Push-agent fallback: if the live SSH probe fails BUT a baseline-store
 * snapshot for this host was recorded within AGENT_FRESH_WINDOW_SECONDS,
 * the test is reported as `ok: true` with a "push-mode" summary. This is
 * the supported topology when BLACKGLASS runs on DO App Platform (its
 * egress to other user-owned Droplets is silently blackholed by the DO
 * network fabric, so SSH pull cannot work no matter how the firewall
 * is configured).
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
import { getBaseline } from "@/lib/server/baseline-store";
import * as net from "node:net";

/** 15 minutes by default — same window the lab-health probe uses. */
function getAgentFreshWindowSeconds(): number {
  const raw = process.env.LAB_AGENT_FRESH_WINDOW_SECONDS;
  if (!raw) return 15 * 60;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 15 * 60;
}

/** Mirrors buildSshConfig's hostId synthesis: "host-<ip-with-dashes>". */
function deriveAgentHostId(hostname: string): string {
  return `host-${hostname.replace(/\./g, "-")}`;
}

async function probeAgentFreshness(hostname: string): Promise<{
  hostId: string;
  lastSeenAt: string | null;
  ageSeconds: number | null;
  fresh: boolean;
}> {
  const hostId = deriveAgentHostId(hostname);
  try {
    const snapshot = await getBaseline(hostId);
    if (!snapshot?.collectedAt) {
      return { hostId, lastSeenAt: null, ageSeconds: null, fresh: false };
    }
    const collectedMs = Date.parse(snapshot.collectedAt);
    if (!Number.isFinite(collectedMs)) {
      return { hostId, lastSeenAt: snapshot.collectedAt, ageSeconds: null, fresh: false };
    }
    const ageSeconds = Math.max(0, Math.round((Date.now() - collectedMs) / 1000));
    return {
      hostId,
      lastSeenAt: snapshot.collectedAt,
      ageSeconds,
      fresh: ageSeconds <= getAgentFreshWindowSeconds(),
    };
  } catch {
    // Baseline store may be unconfigured (memory adapter on a fresh
    // App Platform deploy) — treat as "no agent signal" rather than 500.
    return { hostId, lastSeenAt: null, ageSeconds: null, fresh: false };
  }
}

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
  /** Which signal made this host healthy ("ssh-pull" or "agent-push"); "down" when neither worked. */
  mode: "ssh-pull" | "agent-push" | "agent-push-and-ssh" | "down";
  stages: {
    tcp: { ok: boolean; durationMs: number; error?: string };
    ssh: { ok: boolean; durationMs: number; error?: string };
    exec: { ok: boolean; durationMs: number; error?: string; stdout?: string; stderr?: string };
    agent: {
      ok: boolean;
      hostId: string;
      lastSeenAt: string | null;
      ageSeconds: number | null;
      fresh: boolean;
    };
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
    mode: "down",
    stages: {
      tcp: { ok: false, durationMs: 0 },
      ssh: { ok: false, durationMs: 0 },
      exec: { ok: false, durationMs: 0 },
      agent: {
        ok: false,
        hostId: deriveAgentHostId(host.hostname),
        lastSeenAt: null,
        ageSeconds: null,
        fresh: false,
      },
    },
    summary: "",
  };

  // Stage 0: agent freshness — independent of the SSH probe; we always
  // report it so the operator can see "TCP failed BUT agent is healthy"
  // when the host is actually fine and the SSH probe is just being eaten
  // by the DO App Platform → Droplet egress restriction.
  const agent = await probeAgentFreshness(host.hostname);
  result.stages.agent = { ok: agent.fresh, ...agent };

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
    if (agent.fresh) {
      // SSH pull is broken but the push-agent on the host is healthy —
      // that's a fully valid topology. Report success.
      result.ok = true;
      result.mode = "agent-push";
      result.summary =
        `Push-agent reported ${agent.ageSeconds}s ago — host is healthy in agent-push mode. ` +
        `(SSH probe failed; if BLACKGLASS runs on DO App Platform this is expected — egress to ` +
        `user-owned Droplets is blackholed by the DO network fabric. Use the push-agent instead.)`;
    } else {
      result.mode = "down";
      result.summary = agent.lastSeenAt
        ? `TCP probe failed AND last push-agent ingest was ${agent.ageSeconds}s ago (stale). ` +
          `Check the host's network firewall AND the blackglass-agent.timer status on the host.`
        : "TCP probe failed — check the IP / port / network firewall, OR install the push-agent (scripts/blackglass-agent.sh) on the host.";
    }
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
  const sshFullyHealthy =
    result.stages.tcp.ok && result.stages.ssh.ok && result.stages.exec.ok;
  result.ok = sshFullyHealthy || agent.fresh;
  result.mode = sshFullyHealthy && agent.fresh
    ? "agent-push-and-ssh"
    : sshFullyHealthy
      ? "ssh-pull"
      : agent.fresh
        ? "agent-push"
        : "down";
  if (sshFullyHealthy && agent.fresh) {
    result.summary =
      `Connection healthy — both SSH pull and push-agent are working ` +
      `(agent reported ${agent.ageSeconds}s ago).`;
  } else if (sshFullyHealthy) {
    result.summary = "Connection healthy — collector ready to scan this host.";
  } else if (agent.fresh) {
    result.summary =
      `Push-agent reported ${agent.ageSeconds}s ago — host is healthy in agent-push mode. ` +
      `(SSH path is broken: ${result.stages.ssh.ok ? result.stages.exec.error ?? "exec failed" : result.stages.ssh.error ?? "handshake failed"}.)`;
  } else if (!result.stages.ssh.ok) {
    result.summary = "SSH handshake failed — check credentials and the host's authorized_keys.";
  } else {
    result.summary = "Command exec failed — connection succeeded but `whoami` returned an error.";
  }

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
      mode: result.mode,
      durationMs: result.durationMs,
      tcp: result.stages.tcp.ok,
      ssh: result.stages.ssh.ok,
      exec: result.stages.exec.ok,
      agentFresh: result.stages.agent.fresh,
      agentAgeSeconds: result.stages.agent.ageSeconds,
    },
  });
}
