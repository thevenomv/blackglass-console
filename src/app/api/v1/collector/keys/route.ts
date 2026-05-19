/**
 * GET /api/v1/collector/keys — masked push-ingest credentials (INGEST_API_KEY / per-host map).
 */

import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { getIngestCredentialSummary } from "@/lib/server/ingest-credentials";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { jsonError, rateLimitedResponse } from "@/lib/server/http/json-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);
  if (!(await checkReadApiRate(ip))) {
    return rateLimitedResponse(requestId);
  }

  // Ingest credentials reveal deployment secrets — require secrets.manage so only
  // owners/admins/operators can read them (not viewers or guest_auditors).
  const access = await requireSaasOrLegacyPermission("secrets.manage", ["operator", "admin"]);
  if (!access.ok) return access.response;

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
