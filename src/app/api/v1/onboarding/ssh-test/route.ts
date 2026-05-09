/**
 * POST /api/v1/onboarding/ssh-test
 *
 * One-shot SSH probe for the onboarding wizard. Uses the draft keypair
 * created by /api/v1/onboarding/ssh-keypair to attempt an authenticated
 * SSH session against the user-supplied host. No state is mutated —
 * this is purely diagnostic.
 *
 * Body:
 *   {
 *     keyId:  string  (required — from /ssh-keypair)
 *     host:   string  (IP or DNS)
 *     port?:  number  (default 22)
 *     user?:  string  (default "blackglass")
 *   }
 *
 * Returns the same `{ stage, ok, detail, remedy }` taxonomy as the
 * push-agent error map so the wizard can render parity messages.
 *
 * Stages tried, in order:
 *   tcp_connect       — does the TCP handshake reach the host?
 *   ssh_handshake     — does the SSH protocol negotiate?
 *   ssh_auth          — does the public key authenticate?
 *   exec              — does `whoami` run and return non-empty?
 */

import { z } from "zod";
import { Client, type ConnectConfig } from "ssh2";
import * as net from "node:net";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { requireRole } from "@/lib/server/http/auth-guard";
import { getDraft } from "@/lib/server/onboarding/ssh-drafts";
import { logOnboardingEvent } from "@/lib/server/onboarding/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TCP_BUDGET_MS = 5_000;
const SSH_BUDGET_MS = 10_000;
const EXEC_BUDGET_MS = 5_000;

const BodySchema = z.object({
  keyId: z.string().min(8).max(64),
  host: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9.\-]*$/),
  port: z.number().int().min(1).max(65535).optional(),
  user: z.string().min(1).max(64).optional(),
});

type SshStage = "tcp_connect" | "ssh_handshake" | "ssh_auth" | "exec";

type SshTestResult =
  | {
      ok: true;
      stage: "exec";
      detail: string;
      durationMs: number;
    }
  | {
      ok: false;
      stage: SshStage;
      detail: string;
      remedy: string;
      durationMs: number;
    };

function probeTcp(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP connect timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    socket
      .once("connect", () => {
        clearTimeout(timer);
        socket.end();
        resolve();
      })
      .once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect(port, host);
  });
}

function runOneShot(cfg: ConnectConfig): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const overall = setTimeout(() => {
      conn.end();
      reject(new Error("ssh handshake/exec timeout"));
    }, SSH_BUDGET_MS + EXEC_BUDGET_MS);
    conn
      .on("ready", () => {
        conn.exec("whoami", (err, stream) => {
          if (err) {
            clearTimeout(overall);
            conn.end();
            reject(err);
            return;
          }
          let out = "";
          let errOut = "";
          let exitCode = 0;
          stream.on("close", (code: number | null) => {
            exitCode = typeof code === "number" ? code : 0;
            clearTimeout(overall);
            conn.end();
            resolve({ stdout: out, stderr: errOut, exitCode });
          });
          stream.stdout.on("data", (d: Buffer) => {
            out += d.toString();
          });
          stream.stderr.on("data", (d: Buffer) => {
            errOut += d.toString();
          });
        });
      })
      .on("error", (err) => {
        clearTimeout(overall);
        reject(err);
      })
      .connect(cfg);
  });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (isClerkAuthEnabled()) {
    const access = await requireSaasOrLegacyPermission("hosts.manage", [
      "operator",
      "admin",
    ]);
    if (!access.ok) return access.response;
  } else {
    const guard = await requireRole(["operator", "admin"]);
    if (!guard.ok) return guard.response;
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;
  const parsed = BodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);
  const { keyId, host, port = 22, user = "blackglass" } = parsed.data;

  const draft = getDraft(keyId);
  if (!draft) {
    return jsonError(
      404,
      "draft_expired",
      "The keypair draft has expired. Click 'Generate keypair' again and re-install the public key.",
      requestId,
    );
  }

  const overallStart = Date.now();
  const ingestTenantId = process.env.INGEST_SAAS_TENANT_ID?.trim() ?? null;
  const respond = (r: SshTestResult) => {
    logOnboardingEvent("onboarding.ssh_test_attempted", {
      tenantId: ingestTenantId,
      hostId: host,
      requestId,
      stage: r.stage,
      outcome: r.ok ? "ok" : "fail",
      durationMs: r.durationMs,
      reason: r.ok ? undefined : r.detail.slice(0, 200),
    });
    return jsonWithRequestId(r, requestId);
  };

  // Stage 1: TCP
  try {
    await probeTcp(host, port, TCP_BUDGET_MS);
  } catch (err) {
    return respond({
      ok: false,
      stage: "tcp_connect",
      detail: err instanceof Error ? err.message : String(err),
      remedy:
        "TCP couldn't reach the host. Check the host's network firewall (UFW, security group, cloud firewall) and confirm sshd is listening on the right port.",
      durationMs: Date.now() - overallStart,
    });
  }

  // Stage 2 + 3: SSH handshake + auth + exec
  try {
    const out = await runOneShot({
      host,
      port,
      username: user,
      privateKey: draft.privateKey,
      readyTimeout: SSH_BUDGET_MS,
      tryKeyboard: false,
    });
    if (out.exitCode !== 0) {
      return respond({
        ok: false,
        stage: "exec",
        detail: `whoami exited ${out.exitCode}: ${out.stderr.slice(0, 200)}`,
        remedy:
          "Connection succeeded but the test command failed. Confirm the 'blackglass' user has a valid login shell (the installer creates it with /bin/bash).",
        durationMs: Date.now() - overallStart,
      });
    }
    return respond({
      ok: true,
      stage: "exec",
      detail: `Authenticated as ${out.stdout.trim() || user}`,
      durationMs: Date.now() - overallStart,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Heuristic: 'authentication' / 'permission' → auth failure; otherwise handshake.
    const isAuth = /auth(enticat)?|permission|publickey|password/i.test(msg);
    return respond({
      ok: false,
      stage: isAuth ? "ssh_auth" : "ssh_handshake",
      detail: msg,
      remedy: isAuth
        ? "The public key wasn't accepted by the host. Re-run the install command (the wizard shows it) — most often the key wasn't appended to /home/blackglass/.ssh/authorized_keys, or that file's permissions are wrong (must be 600 owned by blackglass)."
        : "SSH handshake failed before auth. Confirm the host's sshd is configured to accept ed25519 public keys and that no IDS / fail2ban is blocking the console's IP.",
      durationMs: Date.now() - overallStart,
    });
  }
}
