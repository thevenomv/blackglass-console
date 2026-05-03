import { configuredCollectorHostIds } from "@/lib/server/collector-env";
import { enqueueScan } from "@/lib/server/scan-jobs";
import { checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import { collectorConfigured } from "@/lib/server/collector";
import { executeDriftScanJob } from "@/lib/server/services/scan-drift-job";
import { getScanQueue } from "@/lib/server/queue/scan-queue";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { requireScanEnqueueAccess } from "@/lib/server/http/saas-access";
import { ScanPostBodySchema } from "@/lib/server/http/schemas";
import { getLimits } from "@/lib/plan";
import { NextResponse } from "next/server";
import { emitSaasAudit } from "@/lib/saas/event-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireScanEnqueueAccess();
  if (!access.ok) return access.response;

  if (!(await checkScanPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited");
  }

  const raw = await readJsonBodyOptional(request);
  if (!raw.ok) return raw.response;

  const parsed = ScanPostBodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const host_ids = parsed.data.host_ids ?? [];

  if (access.mode === "saas") {
    const hlim = access.ctx.subscription.hostLimit;
    if (host_ids.length > 0 && hlim >= 0 && host_ids.length > hlim) {
      return jsonError(
        403,
        "plan_limit_exceeded",
        `Your workspace allows scanning up to ${hlim} host(s) at a time on the current plan.`,
      );
    }
  } else {
    const limits = getLimits();
    if (host_ids.length > 0 && limits.maxHosts !== -1 && host_ids.length > limits.maxHosts) {
      return jsonError(
        403,
        "plan_limit_exceeded",
        `Your plan allows scanning up to ${limits.maxHosts} host(s) at a time. Upgrade to scan more.`,
      );
    }
  }

  if (collectorConfigured() && host_ids.length > 0) {
    const allowed = new Set(configuredCollectorHostIds());
    const invalid = host_ids.filter((id) => !allowed.has(id));
    if (invalid.length > 0) {
      return jsonError(
        400,
        "invalid_host_ids",
        `Unknown host_id(s): ${invalid.join(", ")}. Check your collector configuration.`,
      );
    }
  }

  const job = enqueueScan(host_ids.length ? host_ids : ["fleet"]);
  const collectOpts =
    host_ids.length > 0
      ? { scanId: job.id, reason: "drift_scan" as const, hostIds: host_ids }
      : { scanId: job.id, reason: "drift_scan" as const };

  if (collectorConfigured()) {
    // Prefer BullMQ queue when REDIS_QUEUE_URL is set — the worker runs in a
    // separate process so SSH fan-out doesn't block the Next.js event loop.
    // Falls back to in-process execution for Stage 0/1 deployments.
    const queue = await getScanQueue();
    if (queue) {
      await queue.add("scan", {
        jobId: job.id,
        collectOpts,
        ...(access.mode === "saas" ? { saasTenantId: access.ctx.tenant.id } : {}),
      });
    } else {
      void executeDriftScanJob(job.id, collectOpts);
    }
  }

  if (access.mode === "saas") {
    void emitSaasAudit({
      tenantId: access.ctx.tenant.id,
      actorUserId: access.ctx.userId,
      action: "scan.queued",
      targetType: "scan_job",
      targetId: job.id,
      metadata: { hostIds: host_ids.length },
    });
  }

  return NextResponse.json(
    { id: job.id, status: "queued" as const },
    { status: 202 },
  );
}
