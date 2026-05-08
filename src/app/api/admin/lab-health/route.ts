/**
 * GET /api/admin/lab-health
 *
 * Pre-flight health check for the long-lived sales-demo VM
 * (`blackglass-lab-01`). Catches the four ways a demo silently breaks
 * between calls so the operator sees red BEFORE getting on Zoom:
 *
 *   1. The configured `COLLECTOR_HOST_1` IP doesn't resolve / route.
 *   2. SSH (port `COLLECTOR_PORT`, default 22) doesn't accept TCP — most
 *      common cause is a Cloud Firewall that has lost the ingress rule.
 *   3. SSH accepts TCP but the OpenSSH banner doesn't return — sshd
 *      crashed / port forwarded somewhere wrong.
 *   4. The configured port doesn't match the port that's actually open
 *      (the bug that bit us when COLLECTOR_PORT was 2222 but the
 *      firewall only allowed 22).
 *
 * Auth: owner/admin only (`secrets.manage` permission, same gate as the
 * other admin routes).
 *
 * Response shape:
 * {
 *   configured: boolean,         // COLLECTOR_HOST_1 is set
 *   host: string | null,
 *   hostName: string | null,
 *   port: number,
 *   tcpReachable: boolean,
 *   sshBanner: string | null,    // first line of the OpenSSH banner
 *   bannerLooksHealthy: boolean, // starts with "SSH-2.0"
 *   probedAt: string,            // ISO timestamp
 *   latencyMs: number,
 *   warnings: string[],          // human-readable issues for the UI
 * }
 *
 * Always returns HTTP 200 — `tcpReachable: false` + warnings in the
 * body is the failure signal so uptime monitors don't false-page on
 * intermittent Cloud Firewall flutter.
 */

import { NextResponse } from "next/server";
import { Socket } from "node:net";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LabHealth = {
  configured: boolean;
  host: string | null;
  hostName: string | null;
  port: number;
  tcpReachable: boolean;
  sshBanner: string | null;
  bannerLooksHealthy: boolean;
  probedAt: string;
  latencyMs: number;
  warnings: string[];
};

const PROBE_TIMEOUT_MS = 5_000;
const BANNER_BUF_BYTES = 256;

/**
 * Open a TCP connection, read the first 256 bytes (which sshd sends
 * proactively as a banner), then close. Resolves with the banner string
 * or null on any failure within `PROBE_TIMEOUT_MS`.
 *
 * Implemented at the raw socket level rather than via `ssh2` — we don't
 * want to negotiate keys or authenticate, just confirm sshd is alive
 * and looks healthy from the outside.
 */
function probeSshBanner(
  host: string,
  port: number,
): Promise<{ banner: string | null; tcpReachable: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = new Socket();
    let settled = false;
    let buf = Buffer.alloc(0);

    const finish = (banner: string | null, tcpReachable: boolean) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // Socket may already be torn down — ignore.
      }
      resolve({ banner, tcpReachable, latencyMs: Date.now() - startedAt });
    };

    socket.setTimeout(PROBE_TIMEOUT_MS);

    socket.on("timeout", () => finish(buf.length > 0 ? buf.toString("utf8") : null, buf.length > 0));
    socket.on("error", () => finish(null, false));
    socket.on("connect", () => {
      // Connection succeeded — sshd will push the banner unprompted.
      // Wait briefly for it then close.
      setTimeout(() => {
        finish(buf.length > 0 ? buf.toString("utf8").trim() : null, true);
      }, 600);
    });
    socket.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]).subarray(0, BANNER_BUF_BYTES);
    });

    try {
      socket.connect(port, host);
    } catch {
      finish(null, false);
    }
  });
}

function parsePort(raw: string | undefined): number {
  if (!raw) return 22;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65_535) return 22;
  return n;
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  const auth = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!auth.ok) return auth.response;

  const host = process.env.COLLECTOR_HOST_1?.trim() || null;
  const hostName = process.env.COLLECTOR_HOST_1_NAME?.trim() || null;
  const port = parsePort(process.env.COLLECTOR_PORT);
  const probedAt = new Date().toISOString();

  if (!host) {
    const body: LabHealth = {
      configured: false,
      host: null,
      hostName,
      port,
      tcpReachable: false,
      sshBanner: null,
      bannerLooksHealthy: false,
      probedAt,
      latencyMs: 0,
      warnings: [
        "COLLECTOR_HOST_1 env var is not set — the live console has no host to scan.",
      ],
    };
    return NextResponse.json(body, {
      headers: { "x-request-id": requestId },
    });
  }

  const probe = await probeSshBanner(host, port);
  const bannerFirstLine = probe.banner?.split(/\r?\n/, 1)[0] ?? null;
  const bannerLooksHealthy = bannerFirstLine?.startsWith("SSH-2.0") === true;

  const warnings: string[] = [];
  if (!probe.tcpReachable) {
    warnings.push(
      `TCP connect to ${host}:${port} failed within ${PROBE_TIMEOUT_MS}ms — likely a firewall or routing issue. ` +
        `Confirm the DigitalOcean Cloud Firewall ingress rule for port ${port} is in place.`,
    );
  } else if (!bannerLooksHealthy) {
    warnings.push(
      `Connected to ${host}:${port} but did not receive an SSH-2.0 banner — sshd may have crashed or the port is forwarding to the wrong service.`,
    );
  }

  // Cross-check against the other commonly-mistuned port so the operator
  // gets a hint when COLLECTOR_PORT and the firewall disagree.
  if (probe.tcpReachable && bannerLooksHealthy && port !== 22) {
    warnings.push(
      `COLLECTOR_PORT is set to ${port}; if you replace the demo VM make sure the new firewall rule keeps port ${port} open.`,
    );
  }

  const body: LabHealth = {
    configured: true,
    host,
    hostName,
    port,
    tcpReachable: probe.tcpReachable,
    sshBanner: bannerFirstLine,
    bannerLooksHealthy,
    probedAt,
    latencyMs: probe.latencyMs,
    warnings,
  };

  return NextResponse.json(body, {
    headers: { "x-request-id": requestId },
  });
}
