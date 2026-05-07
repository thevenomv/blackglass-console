/**
 * GET  /api/v1/evidence/cis-mappings  — list this tenant's mappings
 * POST /api/v1/evidence/cis-mappings  — create or update a mapping
 *
 * The unique key is (tenantId, controlId, driftCategory) so POSTing the
 * same triple twice updates rather than duplicates — natural upsert
 * semantics for an editor UI.
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
  listCisMappings,
  upsertCisMapping,
} from "@/lib/server/services/cis-service";

const DRIFT_CATEGORIES = [
  "ssh", "network_exposure", "firewall", "packages",
  "integrity", "identity", "privilege_escalation", "persistence",
] as const;

const PostBodySchema = z.object({
  controlId: z.string().min(1).max(64),
  controlTitle: z.string().min(1).max(200),
  driftCategory: z.enum(DRIFT_CATEGORIES),
  status: z.enum(["active", "not_applicable", "draft"]).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }
  const access = await requireSaasOrLegacyPermission(
    "evidence.view",
    ["auditor", "operator", "admin"],
  );
  if (!access.ok) return access.response;
  if (access.mode === "legacy") return NextResponse.json({ mappings: [] });

  const mappings = await listCisMappings(access.ctx.tenant.id);
  return NextResponse.json({ mappings });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }
  const access = await requireSaasOrLegacyPermission(
    "settings.write",
    ["admin"],
  );
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(400, "not_supported", "CIS mappings require SaaS mode.", requestId);
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = PostBodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const mapping = await upsertCisMapping(
    access.ctx.tenant.id,
    access.ctx.userId,
    {
      controlId: parsed.data.controlId,
      controlTitle: parsed.data.controlTitle,
      driftCategory: parsed.data.driftCategory,
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    },
  );
  return NextResponse.json({ mapping }, { status: 201 });
}
