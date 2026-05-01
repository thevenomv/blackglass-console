import { enqueueScan } from "@/lib/server/scan-jobs";
import { checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!checkScanPostRate(clientIp(request))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let host_ids: string[] = [];
  try {
    const body = (await request.json()) as { host_ids?: string[] };
    host_ids = body.host_ids ?? [];
  } catch {
    host_ids = [];
  }

  const job = enqueueScan(host_ids.length ? host_ids : ["fleet"]);
  return NextResponse.json(
    { id: job.id, status: "queued" as const },
    { status: 202 },
  );
}
