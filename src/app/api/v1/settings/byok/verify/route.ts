/**
 * POST /api/v1/settings/byok/verify
 *
 * Re-runs the BYOK round-trip against the existing tenant config and
 * persists the outcome on `last_verified_at` / `last_verify_error`.
 * Surfaces success/failure inline so the Settings UI can display it
 * immediately.
 *
 * Auth: owner / admin only (`secrets.manage`).
 */

import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import {
  byokEnabled,
  loadTenantKmsConfig,
  tenantKmsStatus,
  verifyTenantKms,
} from "@/lib/server/secrets/tenant-kms";
import { jsonError } from "@/lib/server/http/json-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const access = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(
      400,
      "not_supported",
      "BYOK requires SaaS / multi-tenant mode.",
      requestId,
    );
  }
  if (!byokEnabled()) {
    return jsonError(400, "byok_disabled", "BYOK_ENABLED is not set.", requestId);
  }
  const cfg = await loadTenantKmsConfig(access.ctx.tenant.id);
  if (!cfg) {
    return jsonError(
      404,
      "not_configured",
      "No enabled BYOK row for this tenant.",
      requestId,
    );
  }

  const verify = await verifyTenantKms(access.ctx.tenant.id);
  const status = await tenantKmsStatus(access.ctx.tenant.id);
  return NextResponse.json(
    { verify, status },
    { headers: { "x-request-id": requestId } },
  );
}
