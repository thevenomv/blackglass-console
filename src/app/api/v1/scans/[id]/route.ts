import { getScanRecord, projectScanJob } from "@/lib/server/scan-jobs";
import { checkScanPollRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { ResourceIdPathSchema } from "@/lib/server/http/schemas";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkScanPollRate(clientIp(request))) {
    return jsonError(429, "rate_limited");
  }

  const { id: rawId } = await params;
  const idParsed = ResourceIdPathSchema.safeParse(rawId);
  if (!idParsed.success) return zodErrorResponse(idParsed.error);

  const rec = getScanRecord(idParsed.data);
  if (!rec) {
    return jsonError(404, "scan_not_found");
  }
  return NextResponse.json(projectScanJob(rec));
}
