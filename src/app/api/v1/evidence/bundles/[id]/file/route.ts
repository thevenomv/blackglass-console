/**
 * GET /api/v1/evidence/bundles/:id/file  — stream the full bundle payload as JSON
 */
import { NextResponse } from "next/server";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { planGuard } from "@/lib/plan";
import { getEvidenceBundlePayload } from "@/lib/server/services/evidence-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = clientIp(request);
  if (!(await checkReadApiRate(ip))) {
    return new NextResponse("Too many requests", { status: 429 });
  }

  const guard = planGuard("evidenceExport");
  if (!guard.ok) return guard.response;

  const access = await requireSaasOrLegacyPermission("reports.view", ["viewer", "operator", "admin", "owner"]);
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return new NextResponse("Not available in legacy mode", { status: 400 });
  }

  const { id } = await params;
  const { tenant } = access.ctx;

  const bundle = await getEvidenceBundlePayload(tenant.id, id);
  if (!bundle) {
    return new NextResponse("Bundle not found", { status: 404 });
  }

  const json = JSON.stringify(bundle.payload, null, 2);
  const filename = `evidence-bundle-${id.slice(0, 8)}.json`;

  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Bundle-SHA256": bundle.sha256,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
