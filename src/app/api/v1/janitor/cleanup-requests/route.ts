/**
 * GET /api/v1/janitor/cleanup-requests — list cleanup queue for tenant.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withTenantRls } from "@/db";
import { janitorCleanupRequests, janitorFindings } from "@/db/schema";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("janitor.read", ["operator", "admin"], {
    request,
  });
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return NextResponse.json({ requests: [] }, { headers: { "x-request-id": requestId } });
  }

  const tenantId = access.ctx.tenant.id;
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select({
        id: janitorCleanupRequests.id,
        findingId: janitorCleanupRequests.findingId,
        status: janitorCleanupRequests.status,
        mode: janitorCleanupRequests.mode,
        approvedByUserId: janitorCleanupRequests.approvedByUserId,
        approvedAt: janitorCleanupRequests.approvedAt,
        executedAt: janitorCleanupRequests.executedAt,
        metadata: janitorCleanupRequests.metadata,
        createdAt: janitorCleanupRequests.createdAt,
        resourceType: janitorFindings.resourceType,
        resourceName: janitorFindings.resourceName,
        resourceId: janitorFindings.resourceId,
      })
      .from(janitorCleanupRequests)
      .innerJoin(janitorFindings, eq(janitorCleanupRequests.findingId, janitorFindings.id))
      .where(eq(janitorCleanupRequests.tenantId, tenantId))
      .orderBy(desc(janitorCleanupRequests.createdAt))
      .limit(200),
  );

  return NextResponse.json({ requests: rows }, { headers: { "x-request-id": requestId } });
}
