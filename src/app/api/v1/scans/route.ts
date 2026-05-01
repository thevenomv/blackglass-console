import { configuredCollectorHostIds } from "@/lib/server/collector-env";
import { enqueueScan } from "@/lib/server/scan-jobs";
import { checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import { collectorConfigured } from "@/lib/server/collector";
import { executeDriftScanJob } from "@/lib/server/services/scan-drift-job";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { ScanPostBodySchema } from "@/lib/server/http/schemas";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!checkScanPostRate(clientIp(request))) {
    return jsonError(429, "rate_limited");
  }

  const raw = await readJsonBodyOptional(request);
  if (!raw.ok) return raw.response;

  const parsed = ScanPostBodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const host_ids = parsed.data.host_ids ?? [];

  if (collectorConfigured() && host_ids.length > 0) {
    const allowed = new Set(configuredCollectorHostIds());
    const invalid = host_ids.filter((id) => !allowed.has(id));
    if (invalid.length > 0) {
      const list = [...allowed].sort().join(", ") || "(none)";
      return jsonError(
        400,
        "invalid_host_ids",
        `Unknown host_id(s): ${invalid.join(", ")}. Configured: ${list}`,
      );
    }
  }

  const job = enqueueScan(host_ids.length ? host_ids : ["fleet"]);
  const collectOpts =
    host_ids.length > 0
      ? { scanId: job.id, reason: "drift_scan" as const, hostIds: host_ids }
      : { scanId: job.id, reason: "drift_scan" as const };

  if (collectorConfigured()) {
    void executeDriftScanJob(job.id, collectOpts);
  }

  return NextResponse.json(
    { id: job.id, status: "queued" as const },
    { status: 202 },
  );
}
