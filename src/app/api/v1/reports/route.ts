/**
 * GET  /api/v1/reports — list generated reports
 * POST /api/v1/reports — queue a new report
 *
 * Report metadata is persisted to Spaces (reports/index.json) and content to
 * reports/{id}.json.  Falls back to in-process global when Spaces is not
 * configured (local dev).
 */

import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import { checkReportsPostRate, clientIp } from "@/lib/server/rate-limit";
import { getDriftEvents } from "@/lib/server/drift-engine";
import { readAudit } from "@/lib/server/audit-log";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import {
  addReport,
  getReportContent,
  listReports,
  saveReportContent,
  updateReport,
  type ReportEntry,
} from "@/lib/server/report-store";
import { z } from "zod";
import { NextResponse } from "next/server";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import {
  requireSaasOperationalMutation,
  requireSaasOrLegacyPermission,
} from "@/lib/server/http/saas-access";
import { canGenerateReportsForTenant } from "@/lib/saas/operations";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { applySaasSentryContext } from "@/lib/observability/sentry-saas";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";

export const dynamic = "force-dynamic";

const ReportPostSchema = z.object({
  scope: z.enum(["fleet", "tags", "host"]),
  format: z.enum(["markdown", "pdf"]).default("markdown"),
  hostId: z.string().optional(),
});

export async function GET() {
  const access = await requireSaasOrLegacyPermission("reports.view", [
    "viewer",
    "auditor",
    "operator",
    "admin",
  ]);
  if (!access.ok) return access.response;

  const items = await listReports();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  let legacyRole: string | null = null;
  let saasUserId: string | null = null;
  let saasTenantId: string | null = null;

  if (isClerkAuthEnabled()) {
    const m = await requireSaasOperationalMutation("drift.manage", canGenerateReportsForTenant);
    if (!m.ok) return m.response;
    saasUserId = m.ctx.userId;
    saasTenantId = m.ctx.tenant.id;
    void applySaasSentryContext({
      requestId,
      tenantId: m.ctx.tenant.id,
      userId: m.ctx.userId,
      clerkOrgId: m.ctx.tenant.clerkOrgId,
      plan: m.ctx.subscription.planCode,
    });
  } else {
    const guard = await requireRole(["operator", "admin"]);
    if (!guard.ok) return guard.response;
    legacyRole = guard.role;
  }

  if (!(await checkReportsPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many report generation requests.", requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", undefined, requestId);
  }

  const parsed = ReportPostSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const { scope, format, hostId } = parsed.data;

  const id = `rpt-${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const entry: ReportEntry = {
    id,
    title:
      scope === "fleet"
        ? `Fleet integrity — ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`
        : scope === "host" && hostId
          ? `Host ${hostId} — snapshot ${new Date().toISOString().slice(0, 10)}`
          : `${scope} — ${new Date().toISOString().slice(0, 10)}`,
    scope:
      scope === "fleet" ? "Fleet · all hosts" : scope === "host" ? `Host · ${hostId ?? "unknown"}` : `Tag · ${scope}`,
    generatedAt: new Date().toISOString(),
    status: "generating",
    format,
  };

  addReport(entry);

  void generateReport(id, scope, hostId);

  appendAudit({
    action: AUDIT_ACTIONS.REPORT_QUEUED,
    detail: `Report ${id} queued — scope: ${scope}, format: ${format}`,
    actor: legacyRole ?? saasUserId ?? "saas",
    request_id: requestId,
  });

  if (saasTenantId && saasUserId) {
    void emitSaasAudit({
      tenantId: saasTenantId,
      actorUserId: saasUserId,
      action: "report.queued",
      targetType: "report",
      targetId: id,
      metadata: { scope, format, request_id: requestId },
    });
  }

  return jsonWithRequestId(entry, requestId, { status: 202 });
}

async function generateReport(
  id: string,
  scope: string,
  hostId?: string,
): Promise<void> {
  try {
    const events = getDriftEvents(scope === "host" ? hostId : undefined);
    const audit = readAudit(50);

    const content = JSON.stringify(
      { report_id: id, scope, generated_at: new Date().toISOString(), drift_events: events, recent_audit: audit },
      null,
      2,
    );

    await saveReportContent(id, content);
    updateReport(id, { status: "ready" });
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    console.error("[reports] Generation failed:", err);
    updateReport(id, { status: "failed", failReason: reason });
  }
}
