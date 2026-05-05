/**
 * Background drift scan after POST /api/v1/scans — keeps route handler thin.
 */
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { getBaseline } from "@/lib/server/baseline-store";
import { collectAllSnapshots, type CollectScanOptions } from "@/lib/server/collector";
import { computeDrift, storeDriftEvents } from "@/lib/server/drift-engine";
import { recordDriftScanDayStamp } from "@/lib/server/drift-history";
import { revalidateIntegritySurfaces } from "@/lib/server/integrity-revalidate";
import { markScanDone, resolveScan } from "@/lib/server/scan-jobs";

// ---------------------------------------------------------------------------
// Slack alerting — fire-and-forget; no-op when SLACK_ALERT_WEBHOOK_URL is unset
// ---------------------------------------------------------------------------

async function alertSlack(text: string): Promise<void> {
  const url = process.env.SLACK_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (alertErr) {
    // Never let alerting failure mask the original error
    console.error("[scan-drift-job] Slack alert failed:", alertErr);
  }
}

export async function executeDriftScanJob(
  jobId: string,
  collectOpts: CollectScanOptions,
): Promise<void> {
  console.log(`[scan-drift-job] START jobId=${jobId}`);
  try {
    const results = await collectAllSnapshots(collectOpts);
    console.log(`[scan-drift-job] collected ${results.length} host(s)`);

    let totalDrift = 0;
    const failures: string[] = [];

    for (const result of results) {
      if (result.error || !result.snapshot) {
        failures.push(`${result.hostId}: ${result.error ?? "no snapshot"}`);
        console.log(`[scan-drift-job] FAILED hostId=${result.hostId}: ${result.error}`);
        continue;
      }

      const current = result.snapshot;
      const baseline = await getBaseline(current.hostId);

      if (!baseline) {
        failures.push(
          `${current.hostId}: No baseline captured. Call POST /api/v1/baselines first.`,
        );
        console.log(`[scan-drift-job] NO BASELINE hostId=${current.hostId}`);
        continue;
      }

      const events = computeDrift(baseline, current);
      console.log(`[scan-drift-job] hostId=${current.hostId} drift=${events.length} events: ${events.map(e => e.title).join(", ") || "(none)"}`);
      storeDriftEvents(current.hostId, events);
      totalDrift += events.length;

      appendAudit({
        action: AUDIT_ACTIONS.SCAN_COMPLETED,
        detail: `Scan ${jobId} — ${current.hostname}: ${events.length} drift events`,
        scan_id: jobId,
      });
    }

    if (failures.length === results.length) {
      resolveScan(jobId, "failed", failures.join("; "));
      appendAudit({
        action: AUDIT_ACTIONS.SCAN_FAILED,
        detail: `Scan ${jobId} failed: ${failures.join("; ")}`,
        scan_id: jobId,
      });
      void alertSlack(`:x: *Scan failed* \`${jobId}\`\n${failures.join("\n")}`);
    } else {
      await recordDriftScanDayStamp(totalDrift);
      resolveScan(jobId, "succeeded", failures.length ? failures.join("; ") : undefined, totalDrift);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    resolveScan(jobId, "failed", `Collection error: ${message}`);
    appendAudit({
      action: AUDIT_ACTIONS.SCAN_FAILED,
      detail: `Scan ${jobId} failed: ${message}`,
      scan_id: jobId,
    });
    void alertSlack(`:x: *Scan exception* \`${jobId}\`\n${message}`);
  } finally {
    // Always drain the running-scans registry so SIGTERM doesn't hang.
    markScanDone(jobId);
    revalidateIntegritySurfaces();
  }
}
