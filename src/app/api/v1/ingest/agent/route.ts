/**
 * POST /api/v1/ingest/agent
 *
 * Push-agent ingestion for hosts that BLACKGLASS cannot reach over SSH
 * (DO App Platform → Droplet egress, air-gapped customers, hosts behind
 * NAT/Tailscale, etc).
 *
 * Wire shape (this route):
 *
 *   { hostId, hostname, collectedAt, bundle }
 *
 * `bundle` is the raw stdout of the same `BUNDLE_CMD` script the SSH
 * collector runs (sections separated by `=BGS:<key>` lines). The server
 * runs the existing collector parsers on it so the resulting
 * HostSnapshot is byte-identical to a snapshot collected via SSH —
 * meaning every dashboard, drift engine, and evidence bundle works
 * unchanged. No second code path to maintain.
 *
 * Auth: same Bearer model as the structured /api/v1/ingest:
 *   - INGEST_API_KEY (shared)
 *   - INGEST_HOST_KEYS_JSON {"hostId": "secret"} (per-host preferred)
 *
 * Tenant gating: if INGEST_SAAS_TENANT_ID is set, refuses the request
 * when accepting it would breach the tenant's host allowance.
 */

import { z } from "zod";
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
} from "@/lib/server/collector/parsers";
import type { HostSnapshot } from "@/lib/server/collector";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { getBaseline, saveBaseline, listBaselineHostIds } from "@/lib/server/baseline-store";
import { storeDriftEvents } from "@/lib/server/drift-engine";
import { processHostSnapshotDrift } from "@/lib/server/services/scan-drift-job";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { checkIngestRate } from "@/lib/server/rate-limit";
import { revalidateIntegritySurfaces } from "@/lib/server/integrity-revalidate";
import { withinHostAllowance } from "@/lib/saas/operations";
import { getSubscriptionForTenant } from "@/lib/saas/tenant-service";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { parseHostIngestKeys } from "@/lib/server/ingest-credentials";
import { isHostTombstoned } from "@/lib/server/host-tombstones";
import { recordAgentSnapshot } from "@/lib/server/agent-snapshot-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Hard cap on raw bundle size — well above what `BUNDLE_CMD` produces on a busy host. */
const MAX_BUNDLE_BYTES = 1_500_000;

const AgentBundlePayloadSchema = z.object({
  hostId: ResourceIdPathSchema,
  hostname: z.string().min(1).max(253),
  collectedAt: z.string().datetime(),
  bundle: z.string().min(1).max(MAX_BUNDLE_BYTES),
});

const BUNDLE_SEP = "=BGS:" as const;

/** Mirror of parseBundleOutput in src/lib/server/collector/ssh.ts (kept private there). */
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

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const apiKey = process.env.INGEST_API_KEY?.trim();
  const hostKeyMap = parseHostIngestKeys();
  if (!apiKey && Object.keys(hostKeyMap).length === 0) {
    console.warn("[ingest/agent] INGEST_API_KEY / INGEST_HOST_KEYS_JSON not configured");
    return jsonError(503, "not_configured", "Push ingestion is not configured on this instance", requestId);
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = AgentBundlePayloadSchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const { hostId, hostname, collectedAt, bundle } = parsed.data;

  const authHeader = request.headers.get("authorization") ?? "";
  const providedKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  const { timingSafeEqual } = await import("node:crypto");
  const enc = (s: string) => Buffer.from(s, "utf8");
  const matchKey = (expected: string) =>
    providedKey.length === expected.length && timingSafeEqual(enc(providedKey), enc(expected));

  const perHost = hostKeyMap[hostId];
  let authed = false;
  if (perHost) {
    authed = matchKey(perHost);
  } else if (apiKey) {
    authed = matchKey(apiKey);
  }

  if (!authed) {
    return jsonError(401, "unauthorized", "Invalid or missing Bearer token", requestId);
  }

  const ingestTenantId = process.env.INGEST_SAAS_TENANT_ID?.trim();
  if (ingestTenantId) {
    const { tryGetDb } = await import("@/db");
    if (!tryGetDb()) {
      return jsonError(503, "database_unavailable", "Tenant-scoped ingest requires DATABASE_URL", requestId);
    }
    const sub = await getSubscriptionForTenant(ingestTenantId);
    if (!sub) {
      return jsonError(403, "ingest_scope_invalid", "INGEST_SAAS_TENANT_ID does not match a tenant", requestId);
    }
    const baselineIds = await listBaselineHostIds();
    const known = new Set(baselineIds);
    const isNewHost = !known.has(hostId);
    const gate = withinHostAllowance(sub, known.size, isNewHost ? 1 : 0);
    if (!gate.ok) {
      return jsonError(403, gate.code, gate.detail, requestId);
    }
  }

  if (!(await checkIngestRate(hostId))) {
    return jsonError(429, "rate_limited", `Ingest rate limit exceeded for host ${hostId}`, requestId);
  }

  // Tombstone check — refuse re-bootstrap for hosts an operator just
  // deleted from the dashboard. Without this guard, a still-running
  // push-agent on the deleted host would re-create the baseline within
  // the next 5-minute timer cycle and the host would silently come
  // back. 410 Gone is the canonical "the resource is intentionally
  // not here" status; agent retry logic should treat this as a stop
  // signal and the host operator either uninstalls the agent or asks
  // an admin to clear the tombstone.
  const tombstone = await isHostTombstoned(hostId, ingestTenantId ?? null);
  if (tombstone) {
    return jsonError(
      410,
      "host_tombstoned",
      `Host ${hostId} was deleted; ignoring agent push until ${tombstone.expiresAt}.`,
      requestId,
    );
  }

  const sections = parseBundleOutput(bundle);
  const snapshot: HostSnapshot = {
    hostId,
    hostname,
    collectedAt,
    listeners: [
      ...parseListeners(sections["ss"] ?? "", "tcp"),
      ...parseListeners(sections["ssudp"] ?? "", "udp"),
    ],
    users: parseUsers(sections["passwd"] ?? ""),
    sudoers: parseSudoers(sections["sudo"] ?? ""),
    sudoersFiles: parseSudoersFiles(sections["sudofiles"] ?? ""),
    cronEntries: parseCron(sections["cron"] ?? ""),
    userCrontabs: parseUserCrontabs(sections["usercron"] ?? ""),
    services: parseServices(sections["svc"] ?? ""),
    ssh: parseSshConfig(sections["sshd"] ?? ""),
    firewall: parseFirewall(sections["ufw"] ?? ""),
    authorizedKeys: parseAuthorizedKeys(sections["authkeys"] ?? ""),
    fileHashes: parseFileHashes(sections["filehashes"] ?? ""),
    hostsEntries: parseHostsEntries(sections["hosts"] ?? ""),
    kernelModules: parseKernelModules(sections["lsmod"] ?? ""),
    suidBinaries: parseSuidBinaries(sections["suid"] ?? ""),
    installedPackages: parseInstalledPackages(sections["pkgs"] ?? ""),
    systemdUnitFiles: parseSystemdUnitFiles(sections["systemdunits"] ?? ""),
  };

  // Drift-detection model for push-agent ingest:
  //
  //   1. First-ever push for a host  → no baseline yet, so this snapshot
  //      becomes the bootstrap baseline (audit: BASELINE_CAPTURE). Drift
  //      events are explicitly cleared so the host shows up "healthy".
  //
  //   2. Subsequent pushes           → diff against the pinned baseline
  //      via the same pipeline scan-drift-job uses (computeDrift +
  //      tenant policies + mute rules + alerts + outbound webhooks).
  //      The baseline is NOT overwritten — only the explicit "Capture
  //      baseline" UI action repins it. This is what makes drift events
  //      stick across pushes instead of vanishing on the next cycle.
  //
  // The baseline itself is also kept in the baseline store as a
  // side-effect of (1) so the SSH-failure agent fallback in
  // collect.ts continues to find a snapshot to fall through to.
  let bootstrap = false;
  let driftCount = 0;
  let totalEvents = 0;
  try {
    const existing = await getBaseline(hostId);
    if (!existing) {
      await saveBaseline(snapshot);
      storeDriftEvents(hostId, []);
      bootstrap = true;
    } else {
      const tenantId = process.env.INGEST_SAAS_TENANT_ID?.trim() || undefined;
      const result = await processHostSnapshotDrift({
        snapshot,
        baseline: existing,
        tenantId,
        jobId: `agent-${hostId}-${Date.now()}`,
        origin: "agent-push",
      });
      driftCount = result.driftCount;
      totalEvents = result.events.length;
    }
  } catch (err) {
    console.error("[ingest/agent] drift pipeline failed for", hostId, err);
    return jsonError(502, "store_error", "Snapshot could not be processed. Check server logs.", requestId);
  }

  // Make this snapshot available to the SSH-fail collector fallback so
  // a "Re-scan" click on a host we cannot reach over SSH still resolves
  // with fresh data instead of timing out the user. See
  // src/lib/server/agent-snapshot-cache.ts for the rationale.
  recordAgentSnapshot(snapshot);

  appendAudit({
    action: bootstrap ? AUDIT_ACTIONS.BASELINE_CAPTURE : AUDIT_ACTIONS.SCAN_COMPLETED,
    detail: bootstrap
      ? `Push-agent bootstrap baseline — host=${hostId} hostname=${hostname} sections=${Object.keys(sections).length}`
      : `Push-agent ingest — host=${hostId} hostname=${hostname} drift=${driftCount} totalEvents=${totalEvents}`,
    actor: hostId,
    request_id: requestId,
  });

  revalidateIntegritySurfaces();

  return jsonWithRequestId(
    {
      ok: true,
      hostId,
      capturedAt: collectedAt,
      sections: Object.keys(sections).length,
      listeners: snapshot.listeners.length,
      users: snapshot.users.length,
      services: snapshot.services.length,
      bootstrap,
      driftEvents: totalEvents,
    },
    requestId,
  );
}
