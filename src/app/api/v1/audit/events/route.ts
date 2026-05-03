import { appendAudit, readAudit } from "@/lib/server/audit-log";
import { readJsonBodyOptional, zodErrorResponse, jsonError } from "@/lib/server/http/json-error";
import { AuditEventsQuerySchema, AuditPostBodySchema } from "@/lib/server/http/schemas";
import { requireRole } from "@/lib/server/http/auth-guard";
import { checkAuditPostRate, clientIp } from "@/lib/server/rate-limit";
import { NextResponse } from "next/server";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import {
  requireSaasOperationalMutation,
  requireSaasOrLegacyPermission,
} from "@/lib/server/http/saas-access";
import { canAppendInvestigationAuditForTenant } from "@/lib/saas/operations";
import { emitSaasAudit } from "@/lib/saas/event-log";
import type { TenantAuthContext } from "@/lib/saas/auth-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireSaasOrLegacyPermission("evidence.view", ["auditor", "operator", "admin"]);
  if (!access.ok) return access.response;

  const u = new URL(request.url);
  const parsed = AuditEventsQuerySchema.safeParse({
    limit: u.searchParams.get("limit"),
    action: u.searchParams.get("action"),
    since: u.searchParams.get("since"),
  });
  if (!parsed.success) return zodErrorResponse(parsed.error);

  return NextResponse.json({
    items: readAudit(parsed.data.limit, {
      actionContains: parsed.data.action,
      sinceIso: parsed.data.since,
    }),
  });
}

export async function POST(request: Request) {
  if (!(await checkAuditPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many audit-append requests.");
  }

  let actorLabel: string;
  let saasCtx: TenantAuthContext | null = null;

  if (isClerkAuthEnabled()) {
    const m = await requireSaasOperationalMutation("drift.manage", canAppendInvestigationAuditForTenant);
    if (!m.ok) return m.response;
    saasCtx = m.ctx;
    actorLabel = m.ctx.userId;
  } else {
    const guard = await requireRole(["operator", "admin"]);
    if (!guard.ok) return guard.response;
    actorLabel = guard.role;
  }

  const raw = await readJsonBodyOptional(request);
  if (!raw.ok) return raw.response;

  const parsed = AuditPostBodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const { action, detail, actor, scan_id } = parsed.data;
  const row = appendAudit({ action, detail, actor: actor ?? actorLabel, scan_id });

  if (saasCtx) {
    void emitSaasAudit({
      tenantId: saasCtx.tenant.id,
      actorUserId: saasCtx.userId,
      action: "audit.investigation_note",
      metadata: { legacy_action: action, detail: detail.slice(0, 500) },
    });
  }

  return NextResponse.json(row, { status: 201 });
}
