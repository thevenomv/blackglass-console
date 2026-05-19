/**
 * POST /api/v1/api-keys/[id]/rotate
 *
 * Issues a brand-new API key for the same tenant + scopes + label, then
 * marks the old key as expiring in 24 hours so callers have time to roll
 * over their CI/CD pipelines without an outage.
 *
 * Returns the raw new key once — store it in your secret manager immediately.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkKeyRotateRate, clientIp } from "@/lib/server/rate-limit";
import { withTenantRls, schema } from "@/db";
import { generateApiKey } from "@/lib/server/api-key-auth";
import { planGuard } from "@/lib/plan";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { emitSaasAudit } from "@/lib/saas/event-log";

const { saasApiKeys } = schema;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  const { id } = await params;

  if (!id || !/^[\w-]{36}$/.test(id)) {
    return jsonError(400, "invalid_id", "Invalid key ID.", requestId);
  }
  if (!(await checkKeyRotateRate(clientIp(request)))) {
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

  const result = await withTenantRls(tenantId, async (db) => {
    const existing = await db
      .select()
      .from(saasApiKeys)
      .where(and(eq(saasApiKeys.id, id), eq(saasApiKeys.tenantId, tenantId)))
      .limit(1);
    const old = existing[0];
    if (!old) return null;

    const { raw, hash } = generateApiKey();
    const inserted = await db
      .insert(saasApiKeys)
      .values({
        tenantId,
        keyHash: hash,
        label: `${old.label} (rotated)`,
        scopes: old.scopes,
        createdBy: access.ctx.userId,
        // Expiry mirrors the old key's policy when present, otherwise null.
        expiresAt: old.expiresAt ?? undefined,
      })
      .returning({
        id: saasApiKeys.id,
        label: saasApiKeys.label,
        scopes: saasApiKeys.scopes,
        createdAt: saasApiKeys.createdAt,
        expiresAt: saasApiKeys.expiresAt,
      });

    // Sunset the old key in 24h so existing CI runs survive the rollover.
    await db
      .update(saasApiKeys)
      .set({ expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) })
      .where(eq(saasApiKeys.id, id));

    return { raw, inserted: inserted[0]! };
  });

  if (!result) {
    return jsonError(404, "not_found", "API key not found.", requestId);
  }

  void emitSaasAudit({
    tenantId,
    actorUserId: access.ctx.userId,
    action: "apikey.rotated",
    targetType: "api_key",
    targetId: id,
    metadata: { request_id: requestId, new_key_id: result.inserted.id },
  });

  return NextResponse.json(
    {
      key: {
        ...result.inserted,
        createdAt: result.inserted.createdAt.toISOString(),
        expiresAt: result.inserted.expiresAt?.toISOString() ?? null,
        rawKey: result.raw,
      },
      sunsetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { status: 201 },
  );
}
