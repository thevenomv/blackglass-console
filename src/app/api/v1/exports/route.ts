/**
 * GET  /api/v1/exports        — list recent data exports for this tenant
 * POST /api/v1/exports        — enqueue a new export
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
import { checkBaselinesRate, checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { enqueueExport, listExports } from "@/lib/server/services/export-service";

const PostBodySchema = z
  .object({
    deliverTo: z.string().email().nullable().optional(),
  })
  .strict();

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") return NextResponse.json({ exports: [] });

  const exports = await listExports(access.ctx.tenant.id);
  return NextResponse.json({ exports });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  // Reuse the baselines rate-limit (6/min/IP) — exports are heavier work.
  if (!(await checkBaselinesRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many export requests.", requestId);
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(
      400,
      "not_supported",
      "Tenant data export requires SaaS mode.",
      requestId,
    );
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = PostBodySchema.safeParse(raw.data ?? {});
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const view = await enqueueExport(
    access.ctx.tenant.id,
    access.ctx.userId,
    parsed.data.deliverTo ?? null,
  );
  return NextResponse.json(view, { status: 202 });
}
