/**
 * GET /api/v1/settings/byok
 *
 * Returns the redacted BYOK status for the current tenant. Used by the
 * Settings → Identity → Bring your own key panel to show whether the
 * customer has supplied their own KMS key, when it was last verified,
 * and what error (if any) the most recent round-trip hit.
 *
 * Always safe — never returns secret material.
 *
 * Auth: tenant-scoped read (`secrets.manage`); 403s for everyone outside
 * owner/admin. Same gate as the other admin status endpoints. Legacy
 * single-tenant deployments fall through to the global flag check
 * (`BYOK_ENABLED`) and report `configured: false` since BYOK is a
 * per-tenant concept.
 */

import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { tenantKmsStatus, byokEnabled } from "@/lib/server/secrets/tenant-kms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const access = await requireSaasOrLegacyPermission("secrets.manage", [
    "admin",
  ]);
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    // Single-tenant deployment — no tenant id, BYOK doesn't apply.
    return NextResponse.json(
      {
        byokEnabled: byokEnabled(),
        configured: false,
        provider: null,
        keyRef: null,
        lastVerifiedAt: null,
        lastVerifyError: null,
      },
      { headers: { "x-request-id": requestId } },
    );
  }

  const status = await tenantKmsStatus(access.ctx.tenant.id);
  return NextResponse.json(status, {
    headers: { "x-request-id": requestId },
  });
}
