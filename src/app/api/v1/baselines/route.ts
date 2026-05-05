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
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { applySaasSentryContext } from "@/lib/observability/sentry-saas";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import type { TenantAuthContext } from "@/lib/saas/auth-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function enrolledHostCount(): Promise<number> {
  if (collectorConfigured()) return configuredHostCount();
  return (await loadHosts()).length;
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkBaselinesRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many baseline capture requests.", requestId);
  }

  let saasCtx: TenantAuthContext | null = null;

  if (isClerkAuthEnabled()) {
    const m = await requireSaasOperationalMutation("baselines.manage", canModifyBaselinesForTenant);
    if (!m.ok) return m.response;
    saasCtx = m.ctx;
    void applySaasSentryContext({
      requestId,
      tenantId: m.ctx.tenant.id,
      userId: m.ctx.userId,
      clerkOrgId: m.ctx.tenant.clerkOrgId,
      plan: m.ctx.subscription.planCode,
    });
    const n = await enrolledHostCount();
    const cap = withinHostAllowance(m.ctx.subscription, n, 0);
    if (!cap.ok) return jsonError(403, cap.code, cap.detail, requestId);
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
      { status: 503, headers: { "x-request-id": requestId } },
    );
  }

  // Hard cap: respond before any upstream proxy (e.g. Cloudflare) kills the connection.
  // 30s keeps total response time (auth overhead ~2-5s + collection ~25s) well under CF's
  // minimum plan timeout of 60s.  Previously 55s was too close to CF's threshold.
  const ROUTE_TIMEOUT_MS = 30_000;
  const outcomeRaw = await Promise.race([
    captureBaselinesFromFleet(),
    new Promise<{ kind: "timeout" }>((resolve) =>
      setTimeout(() => resolve({ kind: "timeout" }), ROUTE_TIMEOUT_MS),
    ),
  ]);
  if (outcomeRaw.kind === "timeout") {
    return jsonError(504, "capture_timeout", "Baseline capture did not complete in time. Check that collector hosts are reachable via SSH and retry.", requestId);
  }
  const outcome = outcomeRaw;
  switch (outcome.kind) {
    case "collection_failed":
      if (saasCtx) {
        void emitSaasAudit({
          tenantId: saasCtx.tenant.id,
          actorUserId: saasCtx.userId,
          action: "baseline.capture_failed",
          metadata: { detail: outcome.detail, request_id: requestId },
        });
      }
      return jsonError(503, "collection_failed", outcome.detail, requestId);
    case "exception":
      console.error("[baselines] Unexpected collection exception:", outcome.message);
      return jsonError(
        500,
        "collection_failed",
        "An unexpected error occurred during collection.",
        requestId,
      );
    case "ok":
      if (saasCtx) {
        void emitSaasAudit({
          tenantId: saasCtx.tenant.id,
          actorUserId: saasCtx.userId,
          action: "baseline.captured",
          metadata: { count: outcome.payload.captured.length, request_id: requestId },
        });
      }
      return jsonWithRequestId(
        {
          captured: outcome.payload.captured,
          ...(outcome.payload.failed?.length ? { failed: outcome.payload.failed } : {}),
        },
        requestId,
      );
    default:
      return jsonError(500, "internal_error", undefined, requestId);
  }
}

/**
 * GET /api/v1/baselines
 * Return a summary of all captured baselines.
 */
export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
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
  return jsonWithRequestId({ baselines }, requestId);
}
