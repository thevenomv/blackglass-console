/**
 * GET /api/v1/agent/wake?hostId=<id>
 *
 * Agent-facing endpoint. Polled by the host's
 * `blackglass-agent-wake.timer` (default cadence: 10s). Returns:
 *   { wake: true,  hostId }  — operator requested an immediate push;
 *                              the flag has been atomically cleared
 *                              so the next poll won't re-trigger.
 *   { wake: false, hostId }  — no pending request; agent should
 *                              keep waiting for its normal timer.
 *
 * Auth: same Bearer token as the ingest endpoint (per-host secret
 * via INGEST_HOST_KEYS_JSON, or shared INGEST_API_KEY for single-
 * tenant deployments). We deliberately accept either so agents
 * already in the field don't need re-keying for this feature.
 *
 * Rate limit: keyed on hostId so a noisy agent can't crowd out
 * others. The read-API limiter is plenty generous for one poll
 * every 10s per host.
 */

import { NextResponse } from "next/server";
import { jsonError, rateLimitedResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { checkIngestRate } from "@/lib/server/rate-limit";
import { consumeWake } from "@/lib/server/agent-wake";
import { isAgentBearerAuthorized } from "@/lib/server/agent-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  const url = new URL(request.url);
  const hostId = (url.searchParams.get("hostId") ?? "").trim();
  if (!hostId || hostId.length > 200 || !/^[a-z0-9._-]+$/i.test(hostId)) {
    return jsonError(400, "invalid_host_id", "hostId query param required.", requestId);
  }

  // Rate limit on hostId — a misbehaving agent can't drown out other
  // hosts even if it's stuck in a fast loop.
  if (!(await checkIngestRate(`wake:${hostId}`))) {
    return rateLimitedResponse(requestId);
  }

  const auth = request.headers.get("authorization") ?? "";
  if (!isAgentBearerAuthorized(auth, hostId)) {
    return jsonError(401, "unauthorized", "Bearer token required.", requestId);
  }

  const wake = await consumeWake(hostId);
  return NextResponse.json(
    { wake, hostId },
    { headers: { "x-request-id": requestId } },
  );
}
