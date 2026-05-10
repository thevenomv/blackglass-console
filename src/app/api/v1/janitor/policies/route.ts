/**
 * GET/PATCH /api/v1/janitor/policies — workspace Charon policy JSON (tag filters, digest).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withTenantRls } from "@/db";
import { saasTenants } from "@/db/schema";
import {
  jsonError,
  readJsonBodyOptional,
  zodErrorResponse,
} from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkBaselinesRate, checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import type { CharonPolicyJson } from "@/lib/janitor/charon-policies";
import { emitSaasAudit } from "@/lib/saas/event-log";

const PatchSchema = z
  .object({
    excludeTagsLower: z.array(z.string()).optional(),
    protectTagsExtraLower: z.array(z.string()).optional(),
    minIdleScore: z.number().min(0).max(100).nullable().optional(),
    emailDigestOnScan: z.boolean().optional(),
    webhookOnScan: z.boolean().optional(),
  })
  .strict();

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
    return NextResponse.json({ policies: {} }, { headers: { "x-request-id": requestId } });
  }

  const tenantId = access.ctx.tenant.id;
  const [row] = await withTenantRls(tenantId, (db) =>
    db
      .select({ charonPolicies: saasTenants.charonPolicies })
      .from(saasTenants)
      .where(eq(saasTenants.id, tenantId))
      .limit(1),
  );

  return NextResponse.json(
    { policies: (row?.charonPolicies ?? {}) as CharonPolicyJson },
    { headers: { "x-request-id": requestId } },
  );
}

export async function PATCH(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkBaselinesRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("janitor.manage", ["operator", "admin"], {
    request,
  });
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(403, "saas_only", "Charon requires a hosted workspace.", requestId);
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;
  const parsed = PatchSchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const tenantId = access.ctx.tenant.id;

  const [updated] = await withTenantRls(tenantId, async (db) => {
    const [cur] = await db
      .select({ charonPolicies: saasTenants.charonPolicies })
      .from(saasTenants)
      .where(eq(saasTenants.id, tenantId))
      .limit(1);

    const base = (cur?.charonPolicies && typeof cur.charonPolicies === "object"
      ? cur.charonPolicies
      : {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...base };
    const p = parsed.data;
    if (p.excludeTagsLower !== undefined) next.excludeTagsLower = p.excludeTagsLower;
    if (p.protectTagsExtraLower !== undefined) next.protectTagsExtraLower = p.protectTagsExtraLower;
    if (p.emailDigestOnScan !== undefined) next.emailDigestOnScan = p.emailDigestOnScan;
    if (p.webhookOnScan !== undefined) next.webhookOnScan = p.webhookOnScan;
    if (p.minIdleScore === null) {
      delete next.minIdleScore;
    } else if (p.minIdleScore !== undefined) {
      next.minIdleScore = p.minIdleScore;
    }

    return db
      .update(saasTenants)
      .set({ charonPolicies: next as Record<string, unknown> })
      .where(eq(saasTenants.id, tenantId))
      .returning({ charonPolicies: saasTenants.charonPolicies });
  });

  await emitSaasAudit({
    tenantId,
    actorUserId: access.ctx.userId,
    action: "janitor.policies.updated",
    targetType: "saas_tenant",
    targetId: tenantId,
    metadata: { ...(requestId ? { request_id: requestId } : {}) },
  });

  return NextResponse.json(
    { policies: (updated?.charonPolicies ?? {}) as CharonPolicyJson },
    { headers: { "x-request-id": requestId } },
  );
}
