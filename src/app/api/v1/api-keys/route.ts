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
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";

const { saasApiKeys } = schema;

/**
 * Exhaustive list of valid API key scopes. Any scope not on this list is
 * rejected at creation time so callers can never mint tokens with arbitrary
 * or wildcard access. Keep in sync with the hasScope() checks scattered
 * through the codebase.
 *
 * The wildcard "*" scope is intentionally absent. It may only be issued in
 * non-production environments when ALLOW_WILDCARD_API_SCOPE=true, and only
 * via direct DB insertion — it cannot be requested through the API.
 */
export const ALLOWED_API_KEY_SCOPES = [
  "scans.run",
  "drift.read",
  "drift.write",
  "hosts.read",
  "hosts.write",
  "api-keys.read",
  "janitor.read",
  "evidence.read",
  "exports.create",
  "baselines.write",
] as const;

export type ApiKeyScope = (typeof ALLOWED_API_KEY_SCOPES)[number];

const ScopeSchema = z
  .string()
  .refine(
    (s: string) => s !== "*" || (process.env.NODE_ENV !== "production" && process.env.ALLOW_WILDCARD_API_SCOPE === "true"),
    { message: 'Wildcard scope "*" is not permitted in production.' },
  )
  .refine(
    (s: string) => s === "*" || (ALLOWED_API_KEY_SCOPES as readonly string[]).includes(s),
    { message: `Invalid scope. Allowed: ${ALLOWED_API_KEY_SCOPES.join(", ")}` },
  );

const CreateKeySchema = z.object({
  label: z.string().min(1).max(100),
  scopes: z.array(ScopeSchema).min(1).max(20).default(["scans.run", "drift.read"]),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  // BILL-04: in SaaS mode the global plan guard reads the single-tenant env var
  // which defaults to "free" and would incorrectly block all tenants. Skip it;
  // per-tenant plan enforcement happens via the subscription row.
  if (!isClerkAuthEnabled()) {
    const guard = planGuard("apiAccess");
    if (!guard.ok) return guard.response;
  }

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
