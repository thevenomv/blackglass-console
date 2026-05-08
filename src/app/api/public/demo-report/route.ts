/**
 * GET /api/public/demo-report
 *
 * Default: branded sample PDF in the same layout as customer integrity reports.
 * ?format=json — same fictional payload used to build the PDF (machine-readable).
 * No auth — for prospects evaluating Blackglass without a workspace.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DEMO_AUDIT, DEMO_DRIFT, DEMO_TENANT_NAME } from "@/lib/demo/seed";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { generateReportPdf } from "@/lib/server/report-pdf";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many download requests.", requestId);
  }

  const generatedAt = new Date().toISOString();
  const reportId = `demo-${generatedAt.slice(0, 10)}`;

  const payload = {
    report_id: reportId,
    scope: `Sample workspace · ${DEMO_TENANT_NAME} (fictional data)`,
    generated_at: generatedAt,
    drift_events: DEMO_DRIFT.map((d) => ({
      id: d.id,
      title: d.title,
      severity: d.severity,
      category: d.category,
      detectedAt: d.detectedAt,
      lifecycle: d.lifecycle,
    })),
    recent_audit: DEMO_AUDIT.map((a) => ({
      at: a.at,
      actor: a.actor,
      action: a.action,
      detail: a.detail,
    })),
  };

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "json") {
    const body = JSON.stringify(payload, null, 2);
    const filename = `blackglass-sample-report-${generatedAt.slice(0, 10)}.json`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "x-request-id": requestId,
      },
    });
  }

  const content = JSON.stringify(payload, null, 2);

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateReportPdf(content);
  } catch (err) {
    console.error("[demo-report] PDF render failed:", err);
    return jsonError(500, "pdf_failed", "Could not build sample PDF.", requestId);
  }

  const buf = new Uint8Array(pdfBytes).slice().buffer;
  const filename = `blackglass-sample-report-${generatedAt.slice(0, 10)}.pdf`;
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "x-request-id": requestId,
    },
  });
}
