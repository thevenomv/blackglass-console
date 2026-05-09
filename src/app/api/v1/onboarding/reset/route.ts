/**
 * POST /api/v1/onboarding/reset
 *
 * "Start over" cascade for a single host. The wizard surfaces this as
 * a button when the user sees a stuck or wrong state (tombstoned host,
 * mis-derived hostId, partial install). It clears every per-host
 * remnant from the system AND returns the install URL the user should
 * re-run on the host.
 *
 * Body: { hostId: string }
 *
 * Cascade:
 *   - Clear tombstone (so a fresh agent push isn't blocked)
 *   - Delete pinned baseline
 *   - Drop every drift event for this hostId
 *   - Forget the in-process agent-snapshot cache entry
 *   - Audit `host.onboarding_reset` so operators can see who reset what
 *
 * Auth: same as `DELETE /api/v1/hosts/:id` — admin/owner with step-up.
 *
 * Idempotent: a reset on a non-existent host returns 200 with the
 * install URL anyway, so the wizard's "Reset and reinstall" button
 * always has a safe fallback action.
 */

import { z } from "zod";
import { NextResponse } from "next/server";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireSaasStepUpMutation } from "@/lib/server/http/saas-access";
import { canRunScansForTenant } from "@/lib/saas/operations";
import { requireRole } from "@/lib/server/http/auth-guard";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import {
  jsonError,
  readJsonBodyOptional,
  zodErrorResponse,
} from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { deleteBaseline } from "@/lib/server/baseline-store";
import { deleteDriftEvents } from "@/lib/server/drift-engine";
import { clearTombstone } from "@/lib/server/host-tombstones";
import { clearAgentSnapshot } from "@/lib/server/agent-snapshot-cache";
import { revalidateIntegritySurfaces } from "@/lib/server/integrity-revalidate";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { logOnboardingEvent } from "@/lib/server/onboarding/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  hostId: ResourceIdPathSchema,
});

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  let tenantId: string | null = null;
  let actorUserId: string | null = null;
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

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = BodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);
  const { hostId } = parsed.data;

  const ingestTenantId = process.env.INGEST_SAAS_TENANT_ID?.trim() ?? null;

  // Run the cascade. Each step is best-effort and never throws past
  // the boundary — a partial reset is still better than no reset.
  let tombstoneCleared = false;
  try {
    tombstoneCleared = await clearTombstone(hostId, ingestTenantId ?? tenantId);
  } catch (err) {
    console.error("[onboarding/reset] tombstone clear failed:", err);
  }

  let baselineRemoved = false;
  try {
    baselineRemoved = await deleteBaseline(hostId);
  } catch (err) {
    console.error("[onboarding/reset] baseline delete failed:", err);
    return jsonError(502, "baseline_delete_failed", undefined, requestId);
  }

  let driftRemoved = false;
  try {
    driftRemoved = await deleteDriftEvents(hostId);
  } catch (err) {
    console.error("[onboarding/reset] drift delete failed:", err);
  }

  const cacheCleared = clearAgentSnapshot(hostId);

  // Audit trail. Both the global and (if SaaS) tenant-scoped logs.
  appendAudit({
    action: AUDIT_ACTIONS.HOST_DELETED,
    detail: `Onboarding reset — host=${hostId} tombstone=${tombstoneCleared} baseline=${baselineRemoved} drift=${driftRemoved} cache=${cacheCleared}`,
    actor: actorUserId ?? "operator",
    request_id: requestId,
  });
  if (tenantId && actorUserId) {
    void emitSaasAudit({
      tenantId,
      actorUserId,
      action: "host.onboarding_reset",
      targetType: "host",
      targetId: hostId,
      metadata: {
        tombstoneCleared,
        baselineRemoved,
        driftRemoved,
        cacheCleared,
      },
    });
  }

  revalidateIntegritySurfaces();

  logOnboardingEvent("onboarding.host_reset", {
    tenantId: tenantId ?? ingestTenantId,
    hostId,
    requestId,
    outcome: "ok",
    meta: {
      tombstoneCleared,
      baselineRemoved,
      driftRemoved,
      cacheCleared,
    },
  });

  // Surface the install URL so the wizard's "Reset and reinstall" can
  // jump straight to the bake-a-fresh-command step without a round-trip
  // through key generation again (the user's existing API key is still
  // valid after a host reset; only the host-side baseline/cache are wiped).
  const consoleUrl = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    `https://${request.headers.get("host") ?? "blackglasssec.com"}`
  ).replace(/\/+$/, "");

  return jsonWithRequestId(
    {
      ok: true,
      hostId,
      cascade: {
        tombstoneCleared,
        baselineRemoved,
        driftRemoved,
        cacheCleared,
      },
      next: {
        install_url: `${consoleUrl}/install-agent.sh?host=${encodeURIComponent(hostId)}`,
        wizard_url: `${consoleUrl}/onboarding`,
      },
    },
    requestId,
  );
}

// Allow the wizard to call this with `fetch(...).then(...)` without a body
// in the SaaS-disabled local dev path — the legacy admin role guard
// already covers it.
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
