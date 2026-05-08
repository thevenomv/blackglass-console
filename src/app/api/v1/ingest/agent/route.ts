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
import { saveBaseline, listBaselineHostIds } from "@/lib/server/baseline-store";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { checkIngestRate } from "@/lib/server/rate-limit";
import { revalidateIntegritySurfaces } from "@/lib/server/integrity-revalidate";
import { withinHostAllowance } from "@/lib/saas/operations";
import { getSubscriptionForTenant } from "@/lib/saas/tenant-service";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { parseHostIngestKeys } from "@/lib/server/ingest-credentials";

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

  try {
    await saveBaseline(snapshot);
  } catch (err) {
    console.error("[ingest/agent] saveBaseline failed for", hostId, err);
    return jsonError(502, "store_error", "Snapshot could not be persisted. Check server logs.", requestId);
  }

  appendAudit({
    action: AUDIT_ACTIONS.BASELINE_CAPTURE,
    detail: `Push-agent (raw bundle) ingest — host=${hostId} hostname=${hostname} sections=${Object.keys(sections).length}`,
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
    },
    requestId,
  );
}
