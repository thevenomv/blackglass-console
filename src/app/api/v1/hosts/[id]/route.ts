/**
 * GET /api/v1/hosts/:id     — fetch a HostRecord
 * DELETE /api/v1/hosts/:id  — forget a host (baseline, drift events, and any
 *                             matching saas_collector_hosts row by hostname)
 *
 * The DELETE path is the "obvious delete host" cascade the dashboard binds to.
 * The collector-hosts settings page already exposes a per-row remove that only
 * unschedules SSH scans; this endpoint additionally scrubs the inventory so
 * the host disappears from /hosts, /dashboard, and /drift.
 */

import { jsonError, rateLimitedResponse, zodErrorResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireRole } from "@/lib/server/http/auth-guard";
import {
  requireSaasOrLegacyPermission,
  requireSaasStepUpMutation,
} from "@/lib/server/http/saas-access";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { canRunScansForTenant } from "@/lib/saas/operations";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { loadHosts } from "@/lib/server/inventory";
import { deleteBaseline, getBaseline } from "@/lib/server/baseline-store";
import { deleteDriftEvents } from "@/lib/server/drift-engine";
import { createTombstone, getTombstoneTtlHours } from "@/lib/server/host-tombstones";
import { revalidateIntegritySurfaces } from "@/lib/server/integrity-revalidate";
import { withTenantRls, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { NextResponse } from "next/server";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(_request);
  const ip = clientIp(_request);
  if (!(await checkReadApiRate(ip))) {
    return rateLimitedResponse(requestId);
  }

  if (isClerkAuthEnabled()) {
    const access = await requireSaasOrLegacyPermission("reports.view", [
      "viewer",
      "auditor",
      "operator",
      "admin",
    ]);
    if (!access.ok) return access.response;
  } else {
    const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
    if (!guard.ok) return guard.response;
  }

  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) return zodErrorResponse(idParsed.error);

  const id = idParsed.data;

  // Try real inventory first (works when collector is configured).
  const hosts = await loadHosts();
  const host = hosts.find((h) => h.id === id);
  if (host) return NextResponse.json(host);

  return jsonError(404, "host_not_found");
}

/**
 * DELETE /api/v1/hosts/:id — full "forget host" cascade.
 *
 * Removes:
 *   - Pinned baseline (baseline-store)
 *   - Drift events (drift-engine; in-memory + Postgres)
 *   - Any saas_collector_hosts rows whose hostname matches the baseline's
 *     hostname (best-effort — push-only hosts may not have a row at all)
 *
 * After this returns 204, the host disappears from /hosts, /dashboard, and
 * /drift on the next render. If a push-agent later re-ingests for the same
 * host_id, a fresh baseline is bootstrapped (no stale drift events leak in).
 */
const { saasCollectorHosts } = schema;

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) return zodErrorResponse(idParsed.error);
  const hostId = idParsed.data;

  // SaaS path: enforce step-up MFA + hosts.manage permission, scoped to a
  // verified tenant. Legacy / single-tenant path falls back to admin role.
  let tenantId: string | undefined;
  let actorUserId: string | undefined;
  if (isClerkAuthEnabled()) {
    const access = await requireSaasStepUpMutation(
      "hosts.manage",
      canRunScansForTenant,
    );
    if (!access.ok) return access.response;
    tenantId = access.ctx.tenant.id;
    actorUserId = access.ctx.userId;
  } else {
    const guard = await requireRole(["admin"]);
    if (!guard.ok) return guard.response;
  }

  // Snapshot the baseline first so we can also clean up the matching
  // collector_hosts row by hostname (collector_hosts.id is a UUID, not the
  // inventory hostId, so we can only match via the hostname field).
  const baseline = await getBaseline(hostId).catch(() => undefined);
  const hostname = baseline?.hostname ?? hostId;

  let baselineRemoved = false;
  let driftRemoved = false;
  let collectorRowsRemoved = 0;

  try {
    baselineRemoved = await deleteBaseline(hostId);
  } catch (err) {
    console.error("[hosts/delete] baseline delete failed:", err);
    return jsonError(502, "baseline_delete_failed");
  }

  try {
    driftRemoved = await deleteDriftEvents(hostId);
  } catch (err) {
    // Drift cleanup is best-effort — log but don't fail the whole cascade
    // (the inventory will already shrink because the baseline is gone).
    console.error("[hosts/delete] drift delete failed:", err);
  }

  if (tenantId) {
    try {
      const removed = await withTenantRls(tenantId, (db) =>
        db
          .delete(saasCollectorHosts)
          .where(
            and(
              eq(saasCollectorHosts.tenantId, tenantId),
              eq(saasCollectorHosts.hostname, hostname),
            ),
          )
          .returning({ id: saasCollectorHosts.id }),
      );
      collectorRowsRemoved = removed.length;
    } catch (err) {
      console.error("[hosts/delete] collector_hosts cleanup failed:", err);
    }
  }

  if (!baselineRemoved && !driftRemoved && collectorRowsRemoved === 0) {
    return jsonError(404, "host_not_found");
  }

  // Tombstone the host so a still-running push-agent can't immediately
  // resurrect it on the next 5-minute timer cycle. Default 24h TTL,
  // configurable via HOST_TOMBSTONE_TTL_HOURS. Best-effort — never fails
  // the cascade because the cascade itself is the source of truth.
  let tombstoneExpiresAt: string | null = null;
  try {
    const tombstone = await createTombstone({
      hostId,
      tenantId: tenantId ?? null,
      hostname,
      deletedBy: actorUserId ?? null,
    });
    tombstoneExpiresAt = tombstone.expiresAt;
  } catch (err) {
    console.error("[hosts/delete] tombstone write failed:", err);
  }

  // Tenant-aware audit (SaaS) + global audit log so single-tenant operators
  // get the same paper trail.
  if (tenantId && actorUserId) {
    await emitSaasAudit({
      tenantId,
      actorUserId,
      action: "host.deleted",
      targetType: "host",
      targetId: hostId,
      metadata: {
        hostname,
        baselineRemoved,
        driftRemoved,
        collectorRowsRemoved,
        tombstoneExpiresAt,
        tombstoneTtlHours: getTombstoneTtlHours(),
      },
    });
  }
  appendAudit({
    action: AUDIT_ACTIONS.HOST_DELETED,
    detail: `Host deleted — id=${hostId} hostname=${hostname} baseline=${baselineRemoved} drift=${driftRemoved} collector_rows=${collectorRowsRemoved} tombstone_until=${tombstoneExpiresAt ?? "n/a"}`,
    actor: actorUserId ?? "operator",
  });

  revalidateIntegritySurfaces();

  return new NextResponse(null, { status: 204 });
}
