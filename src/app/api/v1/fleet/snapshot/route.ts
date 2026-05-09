import { loadFleetSnapshot } from "@/lib/server/inventory";
import { requireRole } from "@/lib/server/http/auth-guard";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { NextResponse } from "next/server";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { rateLimitedResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);
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

  const snapshot = await loadFleetSnapshot();
  return NextResponse.json(snapshot);
}
