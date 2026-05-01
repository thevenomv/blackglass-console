import { getScanRecord, projectScanJob } from "@/lib/server/scan-jobs";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rec = getScanRecord(id);
  if (!rec) {
    return NextResponse.json({ error: "scan_not_found" }, { status: 404 });
  }
  return NextResponse.json(projectScanJob(rec));
}
