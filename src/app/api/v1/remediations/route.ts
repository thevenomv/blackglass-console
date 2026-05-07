/**
 * GET /api/v1/remediations?driftEventId=…
 *
 * Returns the most recent remediation recommendation associated with a
 * given drift event id, scoped to the calling tenant.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  getRemediationByDriftEvent,
  listRemediationsForTenant,
} from "@/lib/server/services/remediation-service";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission(
    "drift.manage",
    ["operator", "admin"],
    { request, scope: "drift.read" },
  );
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return NextResponse.json({ remediations: [] });
  }

  const url = new URL(request.url);
  const driftEventId = url.searchParams.get("driftEventId");
  if (driftEventId) {
    const recommendation = await getRemediationByDriftEvent(
      access.ctx.tenant.id,
      driftEventId,
    );
    return NextResponse.json({ remediation: recommendation });
  }

  const list = await listRemediationsForTenant(access.ctx.tenant.id);
  return NextResponse.json({ remediations: list });
}
