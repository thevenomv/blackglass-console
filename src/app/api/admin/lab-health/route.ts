/**
 * GET /api/admin/lab-health
 *
 * Pre-flight health check for the long-lived sales-demo VM
 * (`blackglass-lab-01`). Catches the ways a demo silently breaks between
 * calls so the operator sees red BEFORE getting on Zoom:
 *
 *   1. The configured `COLLECTOR_HOST_1` IP doesn't resolve / route.
 *   2. SSH (port `COLLECTOR_PORT`, default 22) doesn't accept TCP — most
 *      common cause is a Cloud Firewall that has lost the ingress rule.
 *   3. SSH accepts TCP but the OpenSSH banner doesn't return — sshd
 *      crashed / port forwarded somewhere wrong.
 *   4. The push-agent on the host has stopped sending snapshots (the
 *      preferred health signal — see `mode` field below).
 *
 * Health model (post-Wave 12):
 *   - We run *both* a live TCP/SSH banner probe AND an agent freshness
 *     check against the baseline store. Either signal counts as
 *     "lab is up". The agent signal is preferred because DigitalOcean
 *     App Platform silently blackholes egress to user-owned Droplets,
 *     making the live SSH probe permanently red even on healthy hosts.
 *
 * Response shape:
 * {
 *   configured, host, hostName, port,
 *   mode: "ssh-pull" | "agent-push" | "agent-push-and-ssh" | "down",
 *   tcpReachable, sshBanner, bannerLooksHealthy, probedAt, latencyMs,
 *   agent: {
 *     hostId: string | null,        // hostId we look for in the baseline store
 *     lastSeenAt: string | null,    // ISO timestamp of last successful ingest
 *     ageSeconds: number | null,
 *     fresh: boolean,               // ageSeconds <= AGENT_FRESH_WINDOW_SECONDS
 *   },
 *   healthy: boolean,               // tcpReachable+banner OK || agent fresh
 *   warnings: string[],
 * }
 *
 * Always returns HTTP 200 — `healthy: false` + warnings in the body is
 * the failure signal so uptime monitors don't false-page on intermittent
 * Cloud Firewall flutter.
 */

import { NextResponse } from "next/server";
import { Socket } from "node:net";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { getBaseline } from "@/lib/server/baseline-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LabHealthMode = "ssh-pull" | "agent-push" | "agent-push-and-ssh" | "down";

type LabHealth = {
  configured: boolean;
  host: string | null;
  hostName: string | null;
  port: number;
  mode: LabHealthMode;
  tcpReachable: boolean;
  sshBanner: string | null;
  bannerLooksHealthy: boolean;
  probedAt: string;
  latencyMs: number;
  agent: {
    hostId: string | null;
    lastSeenAt: string | null;
    ageSeconds: number | null;
    fresh: boolean;
  };
  healthy: boolean;
  warnings: string[];
};

/**
 * 15 minutes — agent runs every 5min via the bundled systemd timer, so
 * three consecutive missed runs still counts as "fresh enough to demo on".
 * Tunable via env so air-gapped customers running daily ingests don't
 * trip false alarms. Read at request time (not module-load) so tests
 * can vary it without needing module-cache resets.
 */
function getAgentFreshWindowSeconds(): number {
  const raw = process.env.LAB_AGENT_FRESH_WINDOW_SECONDS;
  if (!raw) return 15 * 60;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 15 * 60;
}

/** Mirror of buildSshConfig's hostId synthesis: "host-<ip-with-dashes>". */
function deriveHostId(host: string | null): string | null {
  if (!host) return null;
  return `host-${host.replace(/\./g, "-")}`;
}

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
      mode: "down",
      tcpReachable: false,
      sshBanner: null,
      bannerLooksHealthy: false,
      probedAt,
      latencyMs: 0,
      agent: { hostId: null, lastSeenAt: null, ageSeconds: null, fresh: false },
      healthy: false,
      warnings: [
        "COLLECTOR_HOST_1 env var is not set — the live console has no host to scan.",
      ],
    };
    return NextResponse.json(body, {
      headers: { "x-request-id": requestId },
    });
  }

  // Agent freshness: prefer explicit LAB_AGENT_HOST_ID override, otherwise
  // re-derive the same hostId the SSH collector would synthesise.
  const agentHostId =
    process.env.LAB_AGENT_HOST_ID?.trim() || deriveHostId(host);
  let agentLastSeenAt: string | null = null;
  let agentAgeSeconds: number | null = null;
  let agentFresh = false;
  const freshWindowSeconds = getAgentFreshWindowSeconds();
  if (agentHostId) {
    try {
      const snapshot = await getBaseline(agentHostId);
      if (snapshot?.collectedAt) {
        agentLastSeenAt = snapshot.collectedAt;
        const collectedMs = Date.parse(snapshot.collectedAt);
        if (Number.isFinite(collectedMs)) {
          agentAgeSeconds = Math.max(0, Math.round((Date.now() - collectedMs) / 1000));
          agentFresh = agentAgeSeconds <= freshWindowSeconds;
        }
      }
    } catch (err) {
      // Baseline store can be unconfigured (memory adapter on a fresh
      // App Platform deploy); treat as "no agent signal" rather than 500.
      console.warn("[lab-health] baseline lookup failed:", err);
    }
  }

  const probe = await probeSshBanner(host, port);
  const bannerFirstLine = probe.banner?.split(/\r?\n/, 1)[0] ?? null;
  const bannerLooksHealthy = bannerFirstLine?.startsWith("SSH-2.0") === true;
  const sshHealthy = probe.tcpReachable && bannerLooksHealthy;

  const warnings: string[] = [];
  if (!sshHealthy && agentFresh) {
    warnings.push(
      `SSH probe to ${host}:${port} failed but the push-agent on hostId=${agentHostId} reported in ${agentAgeSeconds}s ago — ` +
        `the host is healthy. The SSH probe is expected to fail when BLACKGLASS runs on DigitalOcean App Platform ` +
        `(its egress is blackholed for user-owned Droplets); the push agent is the supported model in that case.`,
    );
  } else if (!probe.tcpReachable) {
    warnings.push(
      `TCP connect to ${host}:${port} failed within ${PROBE_TIMEOUT_MS}ms and no recent agent ingest was found — ` +
        `confirm the DigitalOcean Cloud Firewall ingress rule for port ${port} is in place, OR install the push-agent ` +
        `(scripts/blackglass-agent.sh) on the host.`,
    );
  } else if (!bannerLooksHealthy) {
    warnings.push(
      `Connected to ${host}:${port} but did not receive an SSH-2.0 banner — sshd may have crashed or the port is forwarding to the wrong service.`,
    );
  }

  // Don't lecture the operator about installing the push-agent when SSH
  // is already healthy — that's the legacy pull model and a perfectly
  // valid topology. We only nag when the agent is the *expected* health
  // signal (i.e. SSH is not working).
  if (agentHostId && !agentLastSeenAt && !sshHealthy) {
    warnings.push(
      `No baseline snapshot found for hostId=${agentHostId}; if you intend to use push-mode collection, ` +
        `install scripts/blackglass-agent.sh on ${host} (it ships an env file + systemd timer) and verify ` +
        `INGEST_API_KEY (or INGEST_HOST_KEYS_JSON) is configured on the BLACKGLASS instance.`,
    );
  } else if (agentHostId && agentLastSeenAt && !agentFresh) {
    warnings.push(
      `Push-agent for hostId=${agentHostId} last reported ${agentAgeSeconds}s ago — exceeds the freshness ` +
        `window of ${freshWindowSeconds}s. Check the blackglass-agent.timer status on ${host}.`,
    );
  }

  // Cross-check against the other commonly-mistuned port so the operator
  // gets a hint when COLLECTOR_PORT and the firewall disagree.
  if (sshHealthy && port !== 22) {
    warnings.push(
      `COLLECTOR_PORT is set to ${port}; if you replace the demo VM make sure the new firewall rule keeps port ${port} open.`,
    );
  }

  const mode: LabHealthMode = sshHealthy && agentFresh
    ? "agent-push-and-ssh"
    : agentFresh
      ? "agent-push"
      : sshHealthy
        ? "ssh-pull"
        : "down";

  const body: LabHealth = {
    configured: true,
    host,
    hostName,
    port,
    mode,
    tcpReachable: probe.tcpReachable,
    sshBanner: bannerFirstLine,
    bannerLooksHealthy,
    probedAt,
    latencyMs: probe.latencyMs,
    agent: {
      hostId: agentHostId,
      lastSeenAt: agentLastSeenAt,
      ageSeconds: agentAgeSeconds,
      fresh: agentFresh,
    },
    healthy: sshHealthy || agentFresh,
    warnings,
  };

  return NextResponse.json(body, {
    headers: { "x-request-id": requestId },
  });
}
