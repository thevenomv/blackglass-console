/**
 * GET /api/admin/showcase
 *
 * Operator-detail view of the public showcase sandbox. Same data shape as
 * /api/health/showcase plus DB-internal fields that should not be exposed
 * unauthenticated:
 *   - error_message (full, untruncated — useful for triage)
 *   - droplet_id (correlates to the DO console)
 *   - created_at / updated_at
 *   - host_id (FK to saas_collector_hosts so the operator can pivot)
 *
 * Authentication: requires any signed-in tenant member. We do not gate on
 * "owner" role because the dashboard tile that consumes this endpoint is
 * read-only and the underlying data is operationally interesting to anyone
 * looking at the system, not just admins. To keep the surface narrow, no
 * mutations are exposed here — re-provisioning is intentionally a separate
 * workflow (manual destroy via /api/admin/showcase/reprovision in a later
 * wave, when the sandbox-worker is deployed).
 */

import { NextResponse } from "next/server";
import { withBypassRls, schema } from "@/db";
import { and, desc, eq, ne } from "drizzle-orm";
import { requireTenantAuth, SaasAuthError } from "@/lib/saas/auth-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requireTenantAuth();
  } catch (err) {
    if (err instanceof SaasAuthError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }

  const tenantId = process.env.SANDBOX_SHOWCASE_TENANT_ID?.trim();
  if (!tenantId) {
    return NextResponse.json({ enabled: false, reason: "SANDBOX_SHOWCASE_TENANT_ID unset" });
  }

  const { saasSandboxes } = schema;
  const [sandbox] = await withBypassRls((db) =>
    db
      .select()
      .from(saasSandboxes)
      .where(and(eq(saasSandboxes.tenantId, tenantId), ne(saasSandboxes.status, "destroyed")))
      .orderBy(desc(saasSandboxes.createdAt))
      .limit(1),
  );

  if (!sandbox) {
    return NextResponse.json({ enabled: true, sandbox: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const ttl = sandbox.ttlExpiresAt ? new Date(sandbox.ttlExpiresAt) : null;
  const now = new Date();
  const secondsUntilExpiry = ttl ? Math.round((ttl.getTime() - now.getTime()) / 1000) : null;

  return NextResponse.json(
    {
      enabled: true,
      sandbox: {
        id: sandbox.id,
        status: sandbox.status,
        region: sandbox.region,
        seedPhase: sandbox.seedPhase,
        dropletId: sandbox.dropletId,
        dropletIp: sandbox.dropletIp,
        hostId: sandbox.hostId,
        firewallId: sandbox.firewallId,
        ttlExpiresAt: ttl?.toISOString() ?? null,
        secondsUntilExpiry,
        driftSeededAt: sandbox.driftSeededAt,
        createdAt: sandbox.createdAt,
        updatedAt: sandbox.updatedAt,
        errorMessage: sandbox.errorMessage,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
