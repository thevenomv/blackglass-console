/**
 * POST /api/v1/hosts/:id/wake
 *
 * Operator-facing endpoint. Asks the host's push-agent to publish its
 * NEXT snapshot immediately (within ~10 seconds) instead of waiting
 * for the regular 60-second timer tick. Useful when an operator made
 * a manual change on a blackholed host and wants it reflected without
 * a one-minute pause.
 *
 * Auth: requires the same operator role as Run scan (operator+).
 * Rate limit: shared with the read-API limiter so wake spam can't
 * DDOS the agent ingest path.
 *
 * The actual mechanism is a flag in `agent-wake.ts` (Redis when
 * available, in-memory otherwise). The agent polls the corresponding
 * `GET /api/v1/agent/wake` endpoint and triggers an immediate push
 * when the flag is set.
 */

import { NextResponse } from "next/server";
import { jsonError, rateLimitedResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireRole } from "@/lib/server/http/auth-guard";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { requestWake } from "@/lib/server/agent-wake";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);

  if (!(await checkReadApiRate(ip))) {
    return rateLimitedResponse(requestId);
  }

  if (isClerkAuthEnabled()) {
    const access = await requireSaasOrLegacyPermission("scans.run", [
      "operator",
      "admin",
    ]);
    if (!access.ok) return access.response;
  } else {
    const guard = await requireRole(["operator", "admin"]);
    if (!guard.ok) return guard.response;
  }

  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) {
    return jsonError(400, "invalid_id", "Invalid host id format.", requestId);
  }
  const hostId = idParsed.data;

  const storage = await requestWake(hostId);

  appendAudit({
    action: AUDIT_ACTIONS.SCAN_STARTED,
    detail: `force-push wake requested host=${hostId} storage=${storage}`,
    request_id: requestId,
  });

  return NextResponse.json(
    {
      ok: true,
      hostId,
      storage,
      message:
        "Wake flag set. The host's push-agent will publish its next snapshot within ~10 seconds (provided the wake-check timer is installed; see /docs/snapshot-freshness).",
    },
    { headers: { "x-request-id": requestId } },
  );
}
