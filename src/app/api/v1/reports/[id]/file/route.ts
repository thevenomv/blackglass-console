/**
 * GET /api/v1/reports/:id/file — download report content as a file.
 *
 * Error responses are STRUCTURED JSON (not bare strings) so the dashboard,
 * the CLI, and operators clicking a stale URL can all see exactly *why* a
 * report can't be served — not just "404". Reasons:
 *   - report_not_found   : id absent from the index
 *   - report_generating  : status still 'generating' (with elapsed seconds)
 *   - report_failed      : generation failed (failReason surfaced)
 *   - report_content_missing : index entry exists but content blob is gone
 *                              (typically happens when Spaces was reconfigured
 *                              between generation and download)
 *   - pdf_render_failed  : the PDF synthesiser threw
 *
 * On 2026-05-07 a customer hit `/api/v1/reports/rpt-1778018245406-7f614569/file`
 * and got a generic failure with no diagnostics. This route is now
 * self-explaining for the next operator who has to debug it.
 *
 * Stored report bodies are JSON; this handler renders PDF by default so browser
 * downloads open correctly. Use `?format=json` for the raw JSON payload.
 */
import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { getReportContent, listReports } from "@/lib/server/report-store";
import { generateReportPdf } from "@/lib/server/report-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Large drift histories can make pdf-lib synthesis slow; avoid premature serverless termination. */
export const maxDuration = 120;

function jsonErr(status: number, code: string, detail: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { error: code, detail, ...(extra ?? {}) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonErr(429, "rate_limited", "Too many requests.");
  }

  const access = await requireSaasOrLegacyPermission("reports.view", [
    "viewer",
    "auditor",
    "operator",
    "admin",
  ]);
  if (!access.ok) return access.response;

  const { id } = await params;

  const items = await listReports();
  const meta = items.find((r) => r.id === id);
  if (!meta) {
    return jsonErr(404, "report_not_found", `No report with id "${id}".`, { id });
  }

  if (meta.status === "generating") {
    const ageSec = Math.round(
      (Date.now() - new Date(meta.generatedAt).getTime()) / 1000,
    );
    return jsonErr(
      409,
      "report_generating",
      `Report is still being prepared (${ageSec}s elapsed). Try again in a moment.`,
      { id, status: meta.status, generatedAt: meta.generatedAt, ageSeconds: ageSec },
    );
  }

  if (meta.status === "failed") {
    return jsonErr(
      500,
      "report_failed",
      meta.failReason ?? "Report generation failed (no reason recorded).",
      { id, status: meta.status, failReason: meta.failReason ?? null, generatedAt: meta.generatedAt },
    );
  }

  // status === "ready"
  const content = await getReportContent(id);
  if (!content) {
    return jsonErr(
      410,
      "report_content_missing",
      `Report "${id}" was indexed as ready but its content blob is missing — the storage backend may have been reconfigured since generation. Re-generate the report.`,
      { id, status: meta.status, generatedAt: meta.generatedAt },
    );
  }

  const safeName = meta.title
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);

  const url = new URL(request.url);
  const formatParam = url.searchParams.get("format");

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  const isReportJson =
    parsed !== null &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { drift_events?: unknown }).drift_events);

  if (isReportJson && formatParam === "json") {
    const filename = `${safeName}-${id.slice(0, 8)}.json`;
    return new NextResponse(JSON.stringify(parsed, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Generation always persists JSON; render PDF by default so downloads open correctly.
  if (isReportJson) {
    const filename = `${safeName}-${id.slice(0, 8)}.pdf`;
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await generateReportPdf(JSON.stringify(parsed));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[reports] PDF render failed for ${id}:`, err);
      return jsonErr(
        500,
        "pdf_render_failed",
        `PDF synthesiser threw while rendering "${id}": ${reason.slice(0, 200)}`,
        { id, status: meta.status },
      );
    }
    const buf = new Uint8Array(pdfBytes).slice().buffer;
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const ext = meta.format === "pdf" ? "pdf" : "md";
  const filename = `${safeName}-${id.slice(0, 8)}.${ext}`;
  if (meta.format === "pdf") {
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await generateReportPdf(content);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[reports] PDF render failed for ${id}:`, err);
      return jsonErr(
        500,
        "pdf_render_failed",
        `PDF synthesiser threw while rendering "${id}": ${reason.slice(0, 200)}`,
        { id, status: meta.status },
      );
    }
    const buf = new Uint8Array(pdfBytes).slice().buffer;
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
