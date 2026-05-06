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
import { dispatchDriftWebhook } from "@/lib/server/outbound-webhook";
import { sendEmail } from "@/lib/email/send";
import { driftAlertHtml, driftAlertText } from "@/lib/email/templates/drift-alert";
import type { DriftEvent } from "@/data/mock/types";

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

// ---------------------------------------------------------------------------
// Email alerting — fire-and-forget; no-op when ALERT_EMAIL_TO is unset
// ---------------------------------------------------------------------------

async function alertDriftEmail(
  jobId: string,
  hostname: string,
  highEvents: DriftEvent[],
): Promise<void> {
  const to = process.env.ALERT_EMAIL_TO?.trim();
  if (!to || highEvents.length === 0) return;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://app.blackglasssec.com";
  try {
    await sendEmail({
      to,
      subject: `[BLACKGLASS] ${highEvents.length} high-severity drift finding${highEvents.length === 1 ? "" : "s"} on ${hostname}`,
      html: driftAlertHtml({ hostname, jobId, appUrl, findings: highEvents }),
      text: driftAlertText({ hostname, jobId, appUrl, findings: highEvents }),
    });
  } catch (emailErr) {
    console.error("[scan-drift-job] Email alert failed:", emailErr);
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

      // Email alert for high-severity findings (non-blocking).
      const highEvents = events.filter((e) => e.severity === "high");
      if (highEvents.length > 0) {
        void alertDriftEmail(jobId, current.hostname, highEvents);
      }

      // Fire outbound webhooks for qualifying findings (non-blocking).
      if (events.length > 0) {
        void dispatchDriftWebhook({
          scanId: jobId,
          hostId: current.hostId,
          hostname: current.hostname,
          events,
        });
      }

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

      // Auto-generate evidence bundle for tenants in SaaS mode (fire-and-forget).
      if (collectOpts.tenantId && process.env.DATABASE_URL?.trim()) {
        void (async () => {
          try {
            const { generateEvidenceBundle } = await import(
              "@/lib/server/services/evidence-service"
            );
            await generateEvidenceBundle({
              tenantId: collectOpts.tenantId!,
              generatedBy: "auto-scan",
              title: `Auto-scan ${new Date().toISOString().slice(0, 10)} (${jobId.slice(0, 8)})`,
              scope: "all",
              notes: `Automatically generated after scan job ${jobId}. Drift events: ${totalDrift}.`,
            });
          } catch (bundleErr) {
            console.error("[scan-drift-job] Auto evidence bundle failed:", bundleErr);
          }
        })();
      }
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
