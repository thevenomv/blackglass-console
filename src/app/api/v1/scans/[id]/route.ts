import { getScanRecordWithFallback, projectScanJob } from "@/lib/server/scan-jobs";
import { checkScanPollRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isClerkAuthEnabled()) {
    const access = await requireSaasOrLegacyPermission("reports.view", [
      "viewer",
      "auditor",
      "operator",
      "admin",
    ]);
    if (!access.ok) return access.response;
  } else {
    const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
    if (!guard.ok) return guard.response;
  }

  if (!(await checkScanPollRate(clientIp(request)))) {
    return jsonError(429, "rate_limited");
  }

  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) return zodErrorResponse(idParsed.error);

  const rec = await getScanRecordWithFallback(idParsed.data);
  if (!rec) {
    return jsonError(404, "scan_not_found");
  }
  return NextResponse.json(projectScanJob(rec));
}
