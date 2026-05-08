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
import { evaluatePolicies, listPolicies, type PolicyViolation } from "./policy-service";
import { getTenantNotifications } from "./notifications-service";
import { applyMutes, listActiveMutesForWorker } from "./drift-mute-service";
import type { HostSnapshot } from "@/lib/server/collector/types";

// ---------------------------------------------------------------------------
// Slack alerting — fire-and-forget; resolves URL from per-tenant settings or env.
// ---------------------------------------------------------------------------

async function alertSlack(text: string, tenantId: string | undefined): Promise<void> {
  const routing = await getTenantNotifications(tenantId);
  const url = routing.slackWebhookUrl;
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

// ---------------------------------------------------------------------------
// Policy evaluation — fetch tenant policies once per scan, evaluate per host,
// and surface violations as synthetic DriftEvents alongside engine-produced
// drift. No-op when collectOpts.tenantId is unset (legacy/non-SaaS mode).
// ---------------------------------------------------------------------------

function violationToDriftEvent(
  hostId: string,
  v: PolicyViolation,
  detectedAt: string,
): DriftEvent {
  return {
    id: `policy-${v.policyId}-${hostId}`.slice(0, 64),
    hostId,
    category: v.category,
    severity: v.severity,
    lifecycle: "new",
    title: `Policy violation: ${v.policyName}`,
    detectedAt,
    rationale: `Policy "${v.policyName}" requires ${v.key} = "${v.expected}" but the host reports "${v.actual}".`,
    evidenceSummary: JSON.stringify({
      policyId: v.policyId,
      key: v.key,
      expected: v.expected,
      actual: v.actual,
    }),
    suggestedActions: [
      `Restore ${v.key} to "${v.expected}" on the host`,
      "Investigate why the value drifted (manual change, configuration management, package update)",
      "Update the policy if the change is legitimate",
    ],
  };
}

async function evaluateTenantPolicies(
  tenantId: string,
  snapshot: HostSnapshot,
): Promise<DriftEvent[]> {
  try {
    const policies = await listPolicies(tenantId);
    if (policies.length === 0) return [];
    const violations = evaluatePolicies(policies, snapshot);
    if (violations.length === 0) return [];
    const detectedAt = new Date().toISOString();
    return violations.map((v) => violationToDriftEvent(snapshot.hostId, v, detectedAt));
  } catch (err) {
    console.error("[scan-drift-job] Policy evaluation failed:", err);
    return [];
  }
}

async function alertDriftEmail(
  jobId: string,
  hostname: string,
  highEvents: DriftEvent[],
  tenantId: string | undefined,
): Promise<void> {
  if (highEvents.length === 0) return;
  const routing = await getTenantNotifications(tenantId);
  const to = routing.alertEmailTo;
  if (!to) return;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://app.blackglasssec.com";
  try {
    await sendEmail({
      to,
      subject: `[Blackglass] ${highEvents.length} high-severity finding${highEvents.length === 1 ? "" : "s"} on ${hostname}`,
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

      const driftEvents = computeDrift(baseline, current);
      const policyEvents = collectOpts.tenantId
        ? await evaluateTenantPolicies(collectOpts.tenantId, current)
        : [];
      let events = [...driftEvents, ...policyEvents];

      // Apply tenant snooze/mute rules — matched events are kept but flipped
      // to lifecycle:"accepted_risk" so they stop alerting while remaining
      // in the audit trail.
      if (collectOpts.tenantId) {
        try {
          const mutes = await listActiveMutesForWorker(collectOpts.tenantId);
          if (mutes.length > 0) events = applyMutes(events, mutes);
        } catch (err) {
          console.error("[scan-drift-job] mute load failed:", err);
        }
      }
      console.log(
        `[scan-drift-job] hostId=${current.hostId} drift=${driftEvents.length} policy=${policyEvents.length} events: ${events.map((e) => e.title).join(", ") || "(none)"}`,
      );
      storeDriftEvents(current.hostId, events);
      totalDrift += events.length;

      // Email alert for high-severity findings (non-blocking).  Muted
      // findings (lifecycle === "accepted_risk") are excluded from alerting
      // but kept in the audit trail.
      const highEvents = events.filter(
        (e) => e.severity === "high" && e.lifecycle !== "accepted_risk",
      );
      if (highEvents.length > 0) {
        void alertDriftEmail(jobId, current.hostname, highEvents, collectOpts.tenantId);
      }

      // Fire outbound webhooks for non-muted findings (non-blocking).
      const dispatchableEvents = events.filter((e) => e.lifecycle !== "accepted_risk");
      if (dispatchableEvents.length > 0) {
        void dispatchDriftWebhook({
          scanId: jobId,
          ...(collectOpts.tenantId ? { tenantId: collectOpts.tenantId } : {}),
          hostId: current.hostId,
          hostname: current.hostname,
          events: dispatchableEvents,
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
      void alertSlack(`:x: *Scan failed* \`${jobId}\`\n${failures.join("\n")}`, collectOpts.tenantId);
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
    void alertSlack(`:x: *Scan exception* \`${jobId}\`\n${message}`, collectOpts.tenantId);
  } finally {
    // Always drain the running-scans registry so SIGTERM doesn't hang.
    markScanDone(jobId);
    revalidateIntegritySurfaces();
  }
}
