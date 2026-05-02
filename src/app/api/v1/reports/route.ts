/**
 * GET  /api/v1/reports — list generated reports
 * POST /api/v1/reports — queue a new report
 *
 * Report generation runs in-process (async) and writes to the in-process
 * store. For alpha, reports are a JSON summary of current drift events and
 * audit log; a future worker can upload to object storage.
 */

import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import { getDriftEvents } from "@/lib/server/drift-engine";
import { readAudit } from "@/lib/server/audit-log";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { z } from "zod";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// In-process report store
// ---------------------------------------------------------------------------

type ReportEntry = {
  id: string;
  title: string;
  scope: string;
  generatedAt: string;
  status: "ready" | "generating" | "failed";
  format: "markdown" | "pdf";
};

const GLOBAL_KEY = "__blackglass_reports_v1" as const;
type G = typeof globalThis & { [GLOBAL_KEY]?: ReportEntry[] };

function store(): ReportEntry[] {
  const g = globalThis as G;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = [];
  return g[GLOBAL_KEY];
}

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
  return NextResponse.json({ items: store() });
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

  store().unshift(entry);

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
  const entries = store();
  const entry = entries.find((r) => r.id === id);
  if (!entry) return;

  try {
    const events = getDriftEvents(scope === "host" ? hostId : undefined);
    const audit = readAudit(50);

    // Attach the content to a sidecar key so the download route can serve it.
    const SIDECAR_KEY = "__blackglass_report_content_v1" as const;
    type GS = typeof globalThis & { [SIDECAR_KEY]?: Record<string, string> };
    const sidecar = (globalThis as GS);
    if (!sidecar[SIDECAR_KEY]) sidecar[SIDECAR_KEY] = {};
    sidecar[SIDECAR_KEY][id] = JSON.stringify(
      { report_id: id, scope, generated_at: new Date().toISOString(), drift_events: events, recent_audit: audit },
      null,
      2,
    );

    entry.status = "ready";
  } catch (err) {
    console.error("[reports] Generation failed:", err);
    entry.status = "failed";
  }
}
