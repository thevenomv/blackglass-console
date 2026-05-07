/**
 * POST /api/v1/reports/:id/regenerate — re-run report generation for an
 * existing entry that's stuck in `failed` (or `generating` for too long).
 *
 * Why a separate endpoint instead of just POST /api/v1/reports?
 *   - Lets the UI keep the same id (so existing email links remain valid).
 *   - Cleanly resets failReason and status without creating a duplicate
 *     row in the index — keeps the listing tidy.
 *   - Audit log gets a `report.regenerated` line so you can tell
 *     auto-retries from manual ones in the trail.
 *
 * Auth: same operator/admin gate as the POST that originally created it.
 */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { getDriftEventsAsync } from "@/lib/server/drift-engine";
import { readAudit, appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import {
  listReports,
  saveReportContent,
  updateReport,
} from "@/lib/server/report-store";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import {
  requireSaasOperationalMutation,
} from "@/lib/server/http/saas-access";
import { canGenerateReportsForTenant } from "@/lib/saas/operations";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { requireRole } from "@/lib/server/http/auth-guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getOrCreateRequestId(request);
  let legacyRole: string | null = null;
  let saasUserId: string | null = null;
  let saasTenantId: string | null = null;

  if (isClerkAuthEnabled()) {
    const m = await requireSaasOperationalMutation("drift.manage", canGenerateReportsForTenant);
    if (!m.ok) return m.response;
    saasUserId = m.ctx.userId;
    saasTenantId = m.ctx.tenant.id;
  } else {
    const guard = await requireRole(["operator", "admin"]);
    if (!guard.ok) return guard.response;
    legacyRole = guard.role;
  }

  const { id } = await params;

  const items = await listReports();
  const meta = items.find((r) => r.id === id);
  if (!meta) {
    return jsonError(404, "report_not_found", `No report with id "${id}".`, requestId);
  }

  // Reset state. The actual generation runs fire-and-forget below so the
  // HTTP response stays fast.
  updateReport(id, { status: "generating", failReason: undefined, generatedAt: new Date().toISOString() });

  // Infer scope/hostId from the stored entry. The original POST stored the
  // scope as a human string ("Fleet · all hosts" / "Host · <id>" / "Tag · <name>")
  // so we parse it back here. Falls back to "fleet" if the format is unknown.
  let scope: "fleet" | "tags" | "host" = "fleet";
  let hostId: string | undefined;
  if (meta.scope.startsWith("Host ·")) {
    scope = "host";
    hostId = meta.scope.replace(/^Host\s*·\s*/, "").trim() || undefined;
  } else if (meta.scope.startsWith("Tag ·")) {
    scope = "tags";
  }

  void (async () => {
    try {
      const events = await getDriftEventsAsync(scope === "host" ? hostId : undefined);
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
      console.error(`[reports] Regeneration failed for ${id}:`, err);
      updateReport(id, { status: "failed", failReason: reason });
    }
  })();

  appendAudit({
    action: AUDIT_ACTIONS.REPORT_QUEUED,
    detail: `Report ${id} re-queued (regenerate)`,
    actor: legacyRole ?? saasUserId ?? "saas",
    request_id: requestId,
  });

  if (saasTenantId && saasUserId) {
    void emitSaasAudit({
      tenantId: saasTenantId,
      actorUserId: saasUserId,
      action: "report.regenerated",
      targetType: "report",
      targetId: id,
      metadata: { request_id: requestId },
    });
  }

  return NextResponse.json(
    { id, status: "generating", message: "Regeneration queued." },
    { status: 202, headers: { "x-request-id": requestId } },
  );
}
