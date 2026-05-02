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

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST body schema
// ---------------------------------------------------------------------------

const ReportPostSchema = z.object({
  scope: z.enum(["fleet", "tags", "host"]),
  format: z.enum(["markdown", "pdf"]).default("markdown"),
  hostId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function GET() {
  const guard = await requireRole(["auditor", "operator", "admin"]);
  if (!guard.ok) return guard.response;

  const items = await listReports();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const guard = await requireRole(["operator", "admin"]);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json");
  }

  const parsed = ReportPostSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const { scope, format, hostId } = parsed.data;

  const id = `rpt-${Date.now()}`;
  const entry: ReportEntry = {
    id,
    title: scope === "fleet"
      ? `Fleet integrity — ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`
      : scope === "host" && hostId
        ? `Host ${hostId} — snapshot ${new Date().toISOString().slice(0, 10)}`
        : `${scope} — ${new Date().toISOString().slice(0, 10)}`,
    scope: scope === "fleet" ? "Fleet · all hosts" : scope === "host" ? `Host · ${hostId ?? "unknown"}` : `Tag · ${scope}`,
    generatedAt: new Date().toISOString(),
    status: "generating",
    format,
  };

  addReport(entry);

  // Generate the report content asynchronously (fire-and-forget).
  void generateReport(id, scope, hostId);

  appendAudit({
    action: AUDIT_ACTIONS.REPORT_QUEUED,
    detail: `Report ${id} queued — scope: ${scope}, format: ${format}`,
    actor: guard.role,
  });

  return NextResponse.json(entry, { status: 202 });
}

// ---------------------------------------------------------------------------
// Async report generation — builds JSON summary, marks ready/failed
// ---------------------------------------------------------------------------

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
    console.error("[reports] Generation failed:", err);
    updateReport(id, { status: "failed" });
  }
}

