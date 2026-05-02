/**
 * Background drift scan after POST /api/v1/scans — keeps route handler thin.
 */
import { appendAudit } from "@/lib/server/audit-log";
import { getBaseline } from "@/lib/server/baseline-store";
import { collectAllSnapshots, type CollectScanOptions } from "@/lib/server/collector";
import { computeDrift, storeDriftEvents } from "@/lib/server/drift-engine";
import { recordDriftScanDayStamp } from "@/lib/server/drift-history";
import { revalidateIntegritySurfaces } from "@/lib/server/integrity-revalidate";
import { resolveScan } from "@/lib/server/scan-jobs";

export async function executeDriftScanJob(
  jobId: string,
  collectOpts: CollectScanOptions,
): Promise<void> {
  try {
    const results = await collectAllSnapshots(collectOpts);

    let totalDrift = 0;
    const failures: string[] = [];

    for (const result of results) {
      if (result.error || !result.snapshot) {
        failures.push(`${result.hostId}: ${result.error ?? "no snapshot"}`);
        continue;
      }

      const current = result.snapshot;
      const baseline = await getBaseline(current.hostId);

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
        detail: `Scan ${jobId} — ${current.hostname}: ${events.length} drift events`,
        scan_id: jobId,
      });
    }

    if (failures.length > 0 && totalDrift === 0) {
      resolveScan(jobId, "failed", failures.join("; "));
      appendAudit({
        action: "scan.failed",
        detail: `Scan ${jobId} failed: ${failures.join("; ")}`,
        scan_id: jobId,
      });
    } else {
      await recordDriftScanDayStamp(totalDrift);
      resolveScan(jobId, "succeeded", failures.length ? failures.join("; ") : undefined, totalDrift);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    resolveScan(jobId, "failed", `Collection error: ${message}`);
    appendAudit({
      action: "scan.failed",
      detail: `Scan ${jobId} failed: ${message}`,
      scan_id: jobId,
    });
  } finally {
    revalidateIntegritySurfaces();
  }
}
