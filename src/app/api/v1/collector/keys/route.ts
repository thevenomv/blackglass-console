/**
 * GET /api/v1/collector/keys — masked push-ingest credentials (INGEST_API_KEY / per-host map).
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/server/http/auth-guard";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { getIngestCredentialSummary } from "@/lib/server/ingest-credentials";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { jsonError } from "@/lib/server/http/json-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);
  if (!(await checkReadApiRate(ip))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  // This endpoint only reads env var status — no DB query needed.
  // Use a lightweight session check rather than full tenant+subscription auth.
  if (isClerkAuthEnabled()) {
    const { userId, orgId } = await auth();
    if (!userId) return jsonError(401, "unauthenticated", "Sign in required.", requestId);
    if (!orgId) return jsonError(400, "no_organization", "Select a workspace first.", requestId);
  } else {
    const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
    if (!guard.ok) return guard.response;
  }

  const summary = getIngestCredentialSummary();
  return jsonWithRequestId(
    {
      ...summary,
      /** Pull-model SSH collectors use COLLECTOR_HOST_* — see Settings copy and .env.example */
      sshCollectorConfigured: Boolean(process.env.COLLECTOR_HOST_1?.trim()),
    },
    requestId,
  );
}
