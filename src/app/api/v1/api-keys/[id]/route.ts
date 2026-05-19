/**
 * DELETE /api/v1/api-keys/[id]  — revoke an API key
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import { withTenantRls, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { planGuard } from "@/lib/plan";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";

const { saasApiKeys } = schema;

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  const { id } = await params;

  if (!id || !/^[\w-]{36}$/.test(id)) {
    return jsonError(400, "invalid_id", "Invalid key ID.", requestId);
  }

  if (!(await checkScanPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  // BILL-04: skip global guard in SaaS mode (per-tenant plan via subscription row).
  if (!isClerkAuthEnabled()) {
    const guard = planGuard("apiAccess");
    if (!guard.ok) return guard.response;
  }

  const access = await requireSaasOrLegacyPermission("apikeys.manage", ["admin"]);
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return jsonError(400, "not_supported", "API keys require SaaS mode.", requestId);
  }

  const tenantId = access.ctx.tenant.id;
  const deleted = await withTenantRls(tenantId, (db) =>
    db
      .delete(saasApiKeys)
      .where(and(eq(saasApiKeys.id, id), eq(saasApiKeys.tenantId, tenantId)))
      .returning({ id: saasApiKeys.id }),
  );

  if (deleted.length === 0) {
    return jsonError(404, "not_found", "API key not found.", requestId);
  }

  return NextResponse.json({ ok: true });
}
