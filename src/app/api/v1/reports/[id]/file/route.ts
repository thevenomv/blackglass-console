/**
 * GET /api/v1/reports/:id/file — download report content as a file
 */
import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { getReportContent, listReports } from "@/lib/server/report-store";
import { generateReportPdf } from "@/lib/server/report-pdf";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkReadApiRate(clientIp(request)))) {
    return new NextResponse("Too many requests", { status: 429 });
  }

  const access = await requireSaasOrLegacyPermission("reports.view", [
    "viewer",
    "auditor",
    "operator",
    "admin",
  ]);
  if (!access.ok) return access.response;

  const { id } = await params;

  // Resolve metadata so we know the format and title.
  const items = await listReports();
  const meta = items.find((r) => r.id === id);
  if (!meta) {
    return new NextResponse("Report not found", { status: 404 });
  }
  if (meta.status !== "ready") {
    return new NextResponse("Report is not ready", { status: 409 });
  }

  const content = await getReportContent(id);
  if (!content) {
    return new NextResponse("Report content not found", { status: 404 });
  }

  const ext = meta.format === "pdf" ? "pdf" : "md";
  const safeName = meta.title
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  const filename = `${safeName}-${id.slice(0, 8)}.${ext}`;

  if (meta.format === "pdf") {
    // The stored content is always JSON — generate real PDF bytes on demand.
    const pdfBytes = await generateReportPdf(content);
    return new NextResponse(pdfBytes, {
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
