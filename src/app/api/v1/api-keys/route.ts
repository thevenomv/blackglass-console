/**
 * GET    /api/v1/api-keys  — list API keys for the tenant (metadata only, no raw key)
 * POST   /api/v1/api-keys  — create a new API key (raw key shown once)
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import { generateApiKey } from "@/lib/server/api-key-auth";
import { withTenantRls, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { planGuard } from "@/lib/plan";

const { saasApiKeys } = schema;

const CreateKeySchema = z.object({
  label: z.string().min(1).max(100),
  scopes: z.array(z.string().min(1).max(50)).max(20).default(["scans.run", "drift.read"]),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const guard = planGuard("apiAccess");
  if (!guard.ok) return guard.response;

  const access = await requireSaasOrLegacyPermission("apikeys.manage", ["admin"]);
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return NextResponse.json({ keys: [] });
  }

  const tenantId = access.ctx.tenant.id;
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select({
        id: saasApiKeys.id,
        label: saasApiKeys.label,
        scopes: saasApiKeys.scopes,
        createdAt: saasApiKeys.createdAt,
        lastUsedAt: saasApiKeys.lastUsedAt,
        expiresAt: saasApiKeys.expiresAt,
        createdBy: saasApiKeys.createdBy,
      })
      .from(saasApiKeys)
      .where(eq(saasApiKeys.tenantId, tenantId))
      .orderBy(desc(saasApiKeys.createdAt)),
  );

  const keys = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ keys });
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkScanPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const guard = planGuard("apiAccess");
  if (!guard.ok) return guard.response;

  const access = await requireSaasOrLegacyPermission("apikeys.manage", ["admin"]);
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return jsonError(400, "not_supported", "API keys require SaaS mode.", requestId);
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = CreateKeySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const tenantId = access.ctx.tenant.id;
  const { raw: rawKey, hash } = generateApiKey();

  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86400_000)
    : null;

  const [row] = await withTenantRls(tenantId, (db) =>
    db
      .insert(saasApiKeys)
      .values({
        tenantId,
        keyHash: hash,
        label: parsed.data.label,
        scopes: parsed.data.scopes,
        expiresAt: expiresAt ?? undefined,
        createdBy: access.ctx.userId ?? null,
      })
      .returning({
        id: saasApiKeys.id,
        label: saasApiKeys.label,
        scopes: saasApiKeys.scopes,
        createdAt: saasApiKeys.createdAt,
        expiresAt: saasApiKeys.expiresAt,
      }),
  );

  return NextResponse.json(
    {
      key: {
        ...row,
        createdAt: row!.createdAt.toISOString(),
        expiresAt: row!.expiresAt?.toISOString() ?? null,
        /** Raw key shown once — not stored, not recoverable after this response. */
        rawKey,
      },
    },
    { status: 201 },
  );
}
