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
import { recordScanUsage } from "./scan-usage-service";
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

/**
 * Drift-specific Slack notification — sent alongside the email alert
 * whenever a scan turns up at least one high-severity finding for a
 * host. Format follows Slack's `text` + `blocks` pattern so it
 * renders as a card in modern clients but still falls back to plain
 * text in mobile / legacy ones.
 *
 * Why a separate helper from `alertSlack(text)`: callers want
 * structured drift output without each one re-implementing the
 * "title / fields / button" layout, and the Slack `blocks` payload
 * is verbose enough that inlining it everywhere would be noisy.
 */
async function alertDriftSlack(args: {
  jobId: string;
  hostname: string;
  hostId: string;
  highEvents: DriftEvent[];
  tenantId: string | undefined;
}): Promise<void> {
  const { jobId, hostname, hostId, highEvents, tenantId } = args;
  if (highEvents.length === 0) return;
  const routing = await getTenantNotifications(tenantId);
  const url = routing.slackWebhookUrl;
  if (!url) return;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://app.blackglasssec.com";
  const hostUrl = `${appUrl.replace(/\/$/, "")}/hosts/${encodeURIComponent(hostId)}`;

  // Cap the bulleted findings list at 5 — Slack will truncate larger
  // payloads and anything beyond five is just noise; the link to the
  // host page surfaces the full set.
  const bulletList = highEvents.slice(0, 5).map((e) => `• *${e.title}* — ${e.category}`).join("\n");
  const overflow = highEvents.length > 5 ? `\n…and ${highEvents.length - 5} more` : "";

  const headline =
    `:rotating_light: *${highEvents.length} high-severity finding${highEvents.length === 1 ? "" : "s"} on ${hostname}*`;

  // text is the fallback; blocks render the rich card. Slack stops at
  // ~50 blocks per message — we use 4, well within budget.
  const payload = {
    text: `${headline}\n${bulletList}${overflow}\n${hostUrl}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: headline },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: bulletList + overflow },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Scan \`${jobId.slice(0, 8)}\`` },
          { type: "mrkdwn", text: `<${hostUrl}|Open host in Blackglass →>` },
        ],
      },
      { type: "divider" },
    ],
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[scan-drift-job] Slack drift alert failed:", err);
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

/**
 * Synthetic event surfaced when the policy engine itself blew up.
 *
 * Compliance products must fail CLOSED: if we can't evaluate a
 * tenant's policies, the operator must know it. The previous
 * behaviour (catch + log + return []) silently dropped the entire
 * compliance signal — the dashboard would render zero policy
 * violations even though we never actually checked.
 */
function policyEvaluationFailedEvent(
  hostId: string,
  err: unknown,
  detectedAt: string,
): DriftEvent {
  const reason = err instanceof Error ? err.message : String(err);
  return {
    id: `policy-failure-${hostId}`.slice(0, 64),
    hostId,
    category: "policy_failure",
    severity: "high",
    lifecycle: "new",
    title: "Policy evaluation failed",
    detectedAt,
    rationale:
      "Blackglass could not evaluate this tenant's policies for this host. The baseline is unverified until evaluation succeeds.",
    evidenceSummary: JSON.stringify({
      reason: reason.slice(0, 200),
      hint: "Check policy storage availability and recent policy edits.",
    }),
    suggestedActions: [
      "Open Settings → Policies and verify the rules load without errors.",
      "Re-run the scan once policy storage is healthy.",
      "If the failure persists, capture a fresh agent push and check server logs for [scan-drift-job] entries.",
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
    // Fail closed — emit a synthetic high-severity event so the
    // operator sees an explicit "policy evaluation failed" finding
    // on the host instead of a silent zero. The audit log + Slack
    // path still picks this up because it goes through the normal
    // storeDriftEvents → alertDriftEmail flow.
    console.error("[scan-drift-job] Policy evaluation failed:", err);
    return [policyEvaluationFailedEvent(snapshot.hostId, err, new Date().toISOString())];
  }
}

/**
 * Drift pipeline for a single (already-collected) snapshot. Used by both
 * the SSH-scan path (`executeDriftScanJob` below) AND the push-agent
 * ingest path (`/api/v1/ingest/agent`) so they share the exact same
 * policy / mute / alert / webhook semantics — drift detection works the
 * same way regardless of how the snapshot got into the system.
 *
 * Returns the events stored for the host. Caller is responsible for any
 * audit logging it wants to layer on top.
 */
export async function processHostSnapshotDrift(args: {
  snapshot: HostSnapshot;
  baseline: HostSnapshot;
  tenantId?: string;
  jobId: string;
  origin: "scan" | "agent-push";
}): Promise<{ events: DriftEvent[]; driftCount: number; policyCount: number }> {
  const { snapshot: current, baseline, tenantId, jobId, origin } = args;

  const driftEvents = computeDrift(baseline, current);
  const policyEvents = tenantId
    ? await evaluateTenantPolicies(tenantId, current)
    : [];
  let events = [...driftEvents, ...policyEvents];

  if (tenantId) {
    try {
      const mutes = await listActiveMutesForWorker(tenantId);
      if (mutes.length > 0) events = applyMutes(events, mutes);
    } catch (err) {
      console.error(`[drift-pipeline:${origin}] mute load failed:`, err);
    }
  }

  storeDriftEvents(current.hostId, events);

  const highEvents = events.filter(
    (e) => e.severity === "high" && e.lifecycle !== "accepted_risk",
  );
  if (highEvents.length > 0) {
    void alertDriftEmail(jobId, current.hostname, highEvents, tenantId);
    // Slack mirrors the email — same gating (high-severity only,
    // accepted-risk excluded), per-tenant routing, fire-and-forget.
    // No-op when the tenant hasn't set a Slack webhook.
    void alertDriftSlack({
      jobId,
      hostname: current.hostname,
      hostId: current.hostId,
      highEvents,
      tenantId,
    });
  }

  const dispatchableEvents = events.filter((e) => e.lifecycle !== "accepted_risk");
  if (dispatchableEvents.length > 0) {
    void dispatchDriftWebhook({
      scanId: jobId,
      ...(tenantId ? { tenantId } : {}),
      hostId: current.hostId,
      hostname: current.hostname,
      events: dispatchableEvents,
    });
  }

  return {
    events,
    driftCount: driftEvents.length,
    policyCount: policyEvents.length,
  };
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

/**
 * Hard upper bound on `executeDriftScanJob` wall-clock time. If a scan
 * is still running after this many ms, we force-resolve it as failed
 * with a clear message rather than leaving the UI spinning forever.
 *
 * Default: 6 minutes. Bound is generous enough to cover:
 *   - 90 s wait-for-fresh-push fallback per host (capped at the wait window)
 *   - 75 s SSH collection per host (parallel, COLLECTOR_MAX_PARALLEL_SSH)
 *   - drift compute + DB writes + notification fan-out (~5 s)
 *   - generous buffer for slow disks / managed Postgres latency spikes
 *
 * Tunable via SCAN_JOB_DEADLINE_MS for on-prem operators with very
 * large fleets (>100 hosts in a single scan).
 */
const SCAN_JOB_DEADLINE_MS = (() => {
  const raw = parseInt(process.env.SCAN_JOB_DEADLINE_MS ?? "360000", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 360_000;
  return Math.max(60_000, Math.min(30 * 60_000, raw));
})();

export async function executeDriftScanJob(
  jobId: string,
  collectOpts: CollectScanOptions,
): Promise<void> {
  console.log(`[scan-drift-job] START jobId=${jobId} deadline=${SCAN_JOB_DEADLINE_MS}ms`);

  // Wall-clock deadline as a safety net. If `executeDriftScanJobImpl`
  // hangs (queue worker dies mid-scan, SSH library stalls, drift engine
  // gets into a pathological state), this guarantees the scan record
  // resolves to "failed" instead of leaving the user staring at a
  // spinner. Wrapping in Promise.race + manually invoking resolveScan()
  // means the polling client always sees a terminal status within the
  // deadline window.
  let deadlineFired = false;
  const deadline = new Promise<void>((resolve) => {
    setTimeout(() => {
      deadlineFired = true;
      console.error(
        `[scan-drift-job] DEADLINE jobId=${jobId} exceeded ${SCAN_JOB_DEADLINE_MS}ms — force-resolving as failed`,
      );
      resolveScan(
        jobId,
        "failed",
        `Scan exceeded ${Math.round(SCAN_JOB_DEADLINE_MS / 1000)}s wall-clock deadline. ` +
          `Check scan-worker health or set SCAN_JOB_DEADLINE_MS higher for very large fleets.`,
      );
      appendAudit({
        action: AUDIT_ACTIONS.SCAN_FAILED,
        detail: `Scan ${jobId} hit wall-clock deadline (${SCAN_JOB_DEADLINE_MS}ms)`,
        scan_id: jobId,
      });
      markScanDone(jobId);
      revalidateIntegritySurfaces();
      resolve();
    }, SCAN_JOB_DEADLINE_MS).unref?.();
  });

  await Promise.race([
    executeDriftScanJobImpl(jobId, collectOpts).catch((err) => {
      // Catch unexpected throws from the inner pipeline so the
      // deadline race always settles cleanly. The inner function has
      // its own try/catch + resolveScan call, so this is belt+braces.
      console.error(`[scan-drift-job] unexpected error in jobId=${jobId}:`, err);
    }),
    deadline,
  ]);

  if (deadlineFired) {
    // The deadline branch already published the failure; nothing to do.
    // The inner function may still be running in the background but
    // its eventual resolveScan() call is a no-op once the record is
    // already marked terminal.
    return;
  }
}

async function executeDriftScanJobImpl(
  jobId: string,
  collectOpts: CollectScanOptions,
): Promise<void> {
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

      const { events, driftCount, policyCount } = await processHostSnapshotDrift({
        snapshot: current,
        baseline,
        tenantId: collectOpts.tenantId,
        jobId,
        origin: "scan",
      });
      console.log(
        `[scan-drift-job] hostId=${current.hostId} drift=${driftCount} policy=${policyCount} events: ${events.map((e) => e.title).join(", ") || "(none)"}`,
      );
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
      void alertSlack(`:x: *Scan failed* \`${jobId}\`\n${failures.join("\n")}`, collectOpts.tenantId);
    } else {
      await recordDriftScanDayStamp(totalDrift);
      resolveScan(jobId, "succeeded", failures.length ? failures.join("; ") : undefined, totalDrift);

      // Per-tenant scan-cost telemetry — fire-and-forget, never blocks the pipeline.
      if (collectOpts.tenantId) {
        const successCount = results.length - failures.length;
        void recordScanUsage({ tenantId: collectOpts.tenantId, hostScans: successCount });
      }

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
