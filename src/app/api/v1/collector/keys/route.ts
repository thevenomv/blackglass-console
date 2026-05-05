/**
 * GET /api/v1/collector/keys — masked push-ingest credentials (INGEST_API_KEY / per-host map).
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/server/http/auth-guard";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { getIngestCredentialSummary } from "@/lib/server/ingest-credentials";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);
  if (!(await checkReadApiRate(ip))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
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
