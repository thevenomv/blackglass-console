/**
 * GET  /api/v1/evidence/bundles  — list this tenant's evidence bundles
 * POST /api/v1/evidence/bundles  — generate a new bundle
 */

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { planGuard } from "@/lib/plan";
import {
  listEvidenceBundles,
  generateEvidenceBundle,
} from "@/lib/server/services/evidence-service";
import { emitSaasAudit } from "@/lib/saas/event-log";

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);
  if (!(await checkReadApiRate(ip))) {
    return jsonError(429, "rate_limited", "Too many requests.", requestId);
  }

  const guard = planGuard("evidenceExport");
  if (!guard.ok) return guard.response;

  const access = await requireSaasOrLegacyPermission("reports.view", ["viewer", "operator", "admin", "owner"]);
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return jsonWithRequestId({ bundles: [] }, requestId);
  }

  const { tenant } = access.ctx;
  const bundles = await listEvidenceBundles(tenant.id);
  return jsonWithRequestId({ bundles }, requestId);
}

// ── POST ──────────────────────────────────────────────────────────────────────
const generateSchema = z.object({
  title: z.string().min(1).max(200),
  scope: z.string().min(1).max(253).default("all"),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  const guard = planGuard("evidenceExport");
  if (!guard.ok) return guard.response;

  const access = await requireSaasOrLegacyPermission("reports.view", ["operator", "admin", "owner"]);
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return NextResponse.json(
      { error: "not_supported", detail: "Evidence bundles require SaaS mode." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be JSON.", requestId);
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid input.", requestId);
  }

  const { tenant, userId } = access.ctx;
  const { title, scope, notes } = parsed.data;

  const bundle = await generateEvidenceBundle({
    tenantId: tenant.id,
    generatedBy: userId,
    title,
    scope,
    notes,
  });

  await emitSaasAudit({
    tenantId: tenant.id,
    actorUserId: userId,
    action: "evidence_bundle.generated",
    targetType: "evidence_bundle",
    targetId: bundle.id,
    metadata: { title, scope, sha256: bundle.sha256 },
  });

  return jsonWithRequestId({ bundle }, requestId, { status: 201 });
}
