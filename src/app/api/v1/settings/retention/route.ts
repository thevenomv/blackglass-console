/**
 * GET / PUT /api/v1/settings/retention
 *
 * Per-tenant retention policy CRUD.  Owners + admins only (settings.write).
 * NULL / 0 in any field disables pruning for that data class.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  jsonError,
  readJsonBodyOptional,
  zodErrorResponse,
} from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import {
  getRetentionPolicy,
  setRetentionPolicy,
} from "@/lib/server/services/retention-service";

const PutBodySchema = z
  .object({
    driftEventsDays: z.number().int().min(0).max(36500).nullable().optional(),
    baselineSnapshotsDays: z.number().int().min(0).max(36500).nullable().optional(),
    auditEventsDays: z.number().int().min(0).max(36500).nullable().optional(),
    evidenceBundlesDays: z.number().int().min(0).max(36500).nullable().optional(),
  })
  .strict();

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return NextResponse.json({
      driftEventsDays: null,
      baselineSnapshotsDays: null,
      auditEventsDays: null,
      evidenceBundlesDays: null,
    });
  }

  const policy = await getRetentionPolicy(access.ctx.tenant.id);
  return NextResponse.json(policy);
}

export async function PUT(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(
      400,
      "not_supported",
      "Per-tenant retention requires SaaS mode.",
      requestId,
    );
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = PutBodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const policy = await setRetentionPolicy(
    access.ctx.tenant.id,
    access.ctx.userId,
    parsed.data,
  );
  return NextResponse.json(policy);
}
