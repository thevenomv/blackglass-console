import { enqueueScan, resolveScan } from "@/lib/server/scan-jobs";
import { checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import { collectorConfigured, collectAllSnapshots } from "@/lib/server/collector";
import { getBaseline } from "@/lib/server/baseline-store";
import { computeDrift, storeDriftEvents } from "@/lib/server/drift-engine";
import { appendAudit } from "@/lib/server/audit-log";
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

  // When collector is configured, run real SSH collection in the background
  // across all configured COLLECTOR_HOST_N targets in parallel.
  // We don't await it — the client polls /api/v1/scans/:id for status.
  if (collectorConfigured()) {
    void (async () => {
      try {
        const results = await collectAllSnapshots();

        let totalDrift = 0;
        const failures: string[] = [];

        for (const result of results) {
          if (result.error || !result.snapshot) {
            failures.push(`${result.hostId}: ${result.error ?? "no snapshot"}`);
            continue;
          }

          const current = result.snapshot;
          const baseline = getBaseline(current.hostId);

          if (!baseline) {
            failures.push(
              `${current.hostId}: No baseline captured. Call POST /api/v1/baselines first.`,
            );
            continue;
          }

          const events = computeDrift(baseline, current);
          storeDriftEvents(current.hostId, events);
          totalDrift += events.length;

          appendAudit({
            action: "scan.completed",
            detail: `Scan ${job.id} — ${current.hostname}: ${events.length} drift events`,
          });
        }

        if (failures.length > 0 && totalDrift === 0) {
          resolveScan(job.id, "failed", failures.join("; "));
          appendAudit({
            action: "scan.failed",
            detail: `Scan ${job.id} failed: ${failures.join("; ")}`,
          });
        } else {
          resolveScan(job.id, "succeeded", failures.length ? failures.join("; ") : undefined, totalDrift);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        resolveScan(job.id, "failed", `Collection error: ${message}`);
        appendAudit({
          action: "scan.failed",
          detail: `Scan ${job.id} failed: ${message}`,
        });
      }
    })();
  }

  return NextResponse.json(
    { id: job.id, status: "queued" as const },
    { status: 202 },
  );
}

