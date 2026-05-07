/**
 * GET  /api/v1/policies  — list tenant drift policies
 * POST /api/v1/policies  — create a new policy rule
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import { listPolicies, createPolicy } from "@/lib/server/services/policy-service";

const DRIFT_CATEGORIES = [
  "ssh", "network_exposure", "firewall", "packages",
  "integrity", "identity", "privilege_escalation", "persistence",
] as const;

const PolicyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(DRIFT_CATEGORIES),
  conditionKey: z.string().min(1).max(200),
  conditionValue: z.string().min(1).max(500),
  severity: z.enum(["high", "medium", "low"]).default("high"),
  enabled: z.boolean().default(true),
});

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission(
    "reports.view",
    ["viewer", "auditor", "operator", "admin"],
  );
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return NextResponse.json({ policies: [] });
  }

  const policies = await listPolicies(access.ctx.tenant.id);
  return NextResponse.json({ policies });
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkScanPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("policies.manage", ["admin"]);
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return jsonError(400, "not_supported", "Policies require SaaS mode.", requestId);
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = PolicyCreateSchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const policy = await createPolicy(access.ctx.tenant.id, {
    ...parsed.data,
    createdBy: access.ctx.userId ?? null,
  });

  return NextResponse.json({ policy }, { status: 201 });
}
