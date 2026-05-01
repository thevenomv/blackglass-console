import { getScanRecord, projectScanJob } from "@/lib/server/scan-jobs";
import { checkScanPollRate, clientIp } from "@/lib/server/rate-limit";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkScanPollRate(clientIp(request))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  const rec = getScanRecord(id);
  if (!rec) {
    return NextResponse.json({ error: "scan_not_found" }, { status: 404 });
  }
  return NextResponse.json(projectScanJob(rec));
}
