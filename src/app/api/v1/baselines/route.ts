/**
 * POST /api/v1/baselines
 * Capture the current state of every configured collector host as a baseline.
 * Baselines are used by the drift engine during subsequent scans.
 */

import { NextResponse } from "next/server";
import { collectorConfigured, configuredHostCount } from "@/lib/server/collector";
import { captureBaselinesFromFleet } from "@/lib/server/services/baseline-capture";
import { requireRole } from "@/lib/server/http/auth-guard";
import { checkBaselinesRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import {
  requireSaasOperationalMutation,
  requireSaasOrLegacyPermission,
} from "@/lib/server/http/saas-access";
import {
  canModifyBaselinesForTenant,
  withinHostAllowance,
} from "@/lib/saas/operations";
import { loadHosts } from "@/lib/server/inventory";
import { emitSaasAudit } from "@/lib/saas/event-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function enrolledHostCount(): Promise<number> {
  if (collectorConfigured()) return configuredHostCount();
  return (await loadHosts()).length;
}

export async function POST(request: Request) {
  if (!(await checkBaselinesRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many baseline capture requests.");
  }

  let saasCtx: { tenant: { id: string }; userId: string } | null = null;

  if (isClerkAuthEnabled()) {
    const m = await requireSaasOperationalMutation("baselines.manage", canModifyBaselinesForTenant);
    if (!m.ok) return m.response;
    saasCtx = m.ctx;
    const n = await enrolledHostCount();
    const cap = withinHostAllowance(m.ctx.subscription, n, 0);
    if (!cap.ok) return jsonError(403, cap.code, cap.detail);
  } else {
    const guard = await requireRole(["operator", "admin"]);
    if (!guard.ok) return guard.response;
  }

  if (!collectorConfigured()) {
    return NextResponse.json(
      {
        error: "collector_not_configured",
        detail:
          "Set COLLECTOR_HOST_1 and a credential source: SSH_PRIVATE_KEY with SECRET_PROVIDER=env (default), or Doppler/Infisical per operator guide.",
      },
      { status: 503 },
    );
  }

  const outcome = await captureBaselinesFromFleet();
  switch (outcome.kind) {
    case "collection_failed":
      if (saasCtx) {
        void emitSaasAudit({
          tenantId: saasCtx.tenant.id,
          actorUserId: saasCtx.userId,
          action: "baseline.capture_failed",
          metadata: { detail: outcome.detail },
        });
      }
      return NextResponse.json({ error: "collection_failed", detail: outcome.detail }, { status: 503 });
    case "exception":
      console.error("[baselines] Unexpected collection exception:", outcome.message);
      return NextResponse.json(
        { error: "collection_failed", detail: "An unexpected error occurred during collection." },
        { status: 500 },
      );
    case "ok":
      if (saasCtx) {
        void emitSaasAudit({
          tenantId: saasCtx.tenant.id,
          actorUserId: saasCtx.userId,
          action: "baseline.captured",
          metadata: { count: outcome.payload.captured.length },
        });
      }
      return NextResponse.json({
        captured: outcome.payload.captured,
        ...(outcome.payload.failed?.length ? { failed: outcome.payload.failed } : {}),
      });
    default:
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * GET /api/v1/baselines
 * Return a summary of all captured baselines.
 */
export async function GET() {
  const access = await requireSaasOrLegacyPermission("reports.view", [
    "viewer",
    "auditor",
    "operator",
    "admin",
  ]);
  if (!access.ok) return access.response;

  const { listBaselineHostIds, getBaseline } = await import("@/lib/server/baseline-store");
  const ids = await listBaselineHostIds();
  const baselines = await Promise.all(
    ids.map(async (id) => {
      const b = await getBaseline(id);
      return b
        ? {
            hostId: b.hostId,
            hostname: b.hostname,
            capturedAt: b.collectedAt,
            listenersCount: b.listeners.length,
            usersCount: b.users.length,
            servicesCount: b.services.length,
          }
        : { hostId: id };
    }),
  );
  return NextResponse.json({ baselines });
}
