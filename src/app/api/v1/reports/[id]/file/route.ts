/**
 * GET /api/v1/reports/:id/file — download report content as a file
 */
import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { getReportContent, listReports } from "@/lib/server/report-store";

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

  const ext = meta.format === "pdf" ? "json" : "md";
  const safeName = meta.title
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  const filename = `${safeName}-${id.slice(0, 8)}.${ext}`;

  const contentType =
    meta.format === "pdf" ? "application/json" : "text/markdown; charset=utf-8";

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
