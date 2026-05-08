/**
 * Scheduled drift-events digest.
 *
 * Walks every tenant that has `alert_email_to` configured (in
 * `saas_tenant_notifications`), summarises the previous window of drift
 * activity for that tenant, and sends one email each via Resend.
 *
 * Triggered by the ops-worker on a repeatable BullMQ job — see
 * `src/lib/server/queue/maintenance-queue.ts::installDriftDigestRepeatable`.
 *
 * Cadence is configurable via `DRIFT_DIGEST_INTERVAL`:
 *   - "off"     → skip entirely (no repeatable installed)
 *   - "daily"   → 24h window, runs every 24h
 *   - "weekly"  → 7d window, runs every 7d   (default)
 *
 * Air-gapped mode short-circuits send via `sendEmail()` (Resend is a
 * public-internet SaaS).
 *
 * Each tenant's summary is computed on the partitioned `drift_events`
 * table with explicit `tenant_id = $1` filters under bypass RLS — the
 * worker is trusted server code without per-request tenant context.
 */

import { withBypassRls, schema, tryGetDb } from "@/db";
import { sql } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import {
  driftDigestHtml,
  driftDigestText,
  type DriftDigestOptions,
} from "@/lib/email/templates/drift-digest";

const { saasTenantNotifications, saasTenants } = schema;

export type DigestInterval = "off" | "daily" | "weekly";

export interface DigestRunResult {
  tenantId: string;
  workspaceName: string;
  to: string;
  totalsNew: number;
  totalsHigh: number;
  totalsRemediated: number;
  affectedHosts: number;
  emailSent: boolean;
  skippedReason: string | null;
  error: string | null;
}

/** Resolve cadence from env. Returns null when disabled. */
export function digestInterval(): DigestInterval {
  const raw = process.env.DRIFT_DIGEST_INTERVAL?.trim().toLowerCase();
  if (raw === "off") return "off";
  if (raw === "daily") return "daily";
  if (raw === "weekly") return "weekly";
  return "weekly";
}

export function digestEveryMs(interval: DigestInterval): number {
  return interval === "daily"
    ? 24 * 60 * 60 * 1000
    : 7 * 24 * 60 * 60 * 1000;
}

export function digestWindowMs(interval: DigestInterval): number {
  return interval === "daily"
    ? 24 * 60 * 60 * 1000
    : 7 * 24 * 60 * 60 * 1000;
}

export function digestWindowLabel(interval: DigestInterval): string {
  return interval === "daily" ? "last 24 hours" : "last 7 days";
}

interface TenantRow {
  tenantId: string;
  workspaceName: string;
  alertEmailTo: string | null;
  /** Per-tenant override; null means "inherit the deployment default". */
  driftDigestCadence: string | null;
}

async function listTenantsWithEmail(): Promise<TenantRow[]> {
  return withBypassRls(async (db) => {
    const rows = await db
      .select({
        tenantId: saasTenants.id,
        workspaceName: saasTenants.name,
        alertEmailTo: saasTenantNotifications.alertEmailTo,
        driftDigestCadence: saasTenantNotifications.driftDigestCadence,
      })
      .from(saasTenants)
      .leftJoin(
        saasTenantNotifications,
        sql`${saasTenantNotifications.tenantId} = ${saasTenants.id}`,
      );
    return rows
      .filter((r) => (r.alertEmailTo?.trim() ?? "") !== "")
      .map((r) => ({
        tenantId: r.tenantId,
        workspaceName: r.workspaceName ?? "Blackglass workspace",
        alertEmailTo: r.alertEmailTo,
        driftDigestCadence: r.driftDigestCadence,
      }));
  });
}

/**
 * Resolve the effective cadence for a tenant.
 *
 * The deployment-wide cadence (`DRIFT_DIGEST_INTERVAL`) decides HOW OFTEN
 * the worker walks tenants. Per-tenant overrides are deliberately limited
 * to opt-out: `null` (inherit) or `'off'` (skip). We considered allowing
 * tenants to pick daily / weekly independently, but that creates the
 * confusing case where a tenant asks for daily but the worker only fires
 * weekly. Keeping the cadence at the deployment level means the worker
 * cadence is the upper bound on email frequency, and the per-tenant knob
 * is the simple "stop emailing me" toggle that operators actually want.
 */
export function effectiveTenantInterval(
  deploymentDefault: DigestInterval,
  override: string | null,
): DigestInterval {
  if (override === "off") return "off";
  return deploymentDefault;
}

interface TenantTotals {
  countsBySeverity: Record<string, number>;
  countsByLifecycle: Record<string, number>;
  topCategories: Array<{ category: string; count: number }>;
  affectedHosts: number;
}

async function computeTenantTotals(
  tenantId: string,
  windowStart: Date,
): Promise<TenantTotals> {
  return withBypassRls(async (db) => {
    const sevRows = await db.execute(sql`
      SELECT severity, COUNT(*)::bigint AS cnt
      FROM drift_events
      WHERE tenant_id = ${tenantId}::uuid
        AND created_at >= ${windowStart.toISOString()}
      GROUP BY severity
    `);
    const lifecycleRows = await db.execute(sql`
      SELECT lifecycle, COUNT(*)::bigint AS cnt
      FROM drift_events
      WHERE tenant_id = ${tenantId}::uuid
        AND created_at >= ${windowStart.toISOString()}
      GROUP BY lifecycle
    `);
    const catRows = await db.execute(sql`
      SELECT category, COUNT(*)::bigint AS cnt
      FROM drift_events
      WHERE tenant_id = ${tenantId}::uuid
        AND created_at >= ${windowStart.toISOString()}
      GROUP BY category
      ORDER BY cnt DESC
      LIMIT 10
    `);
    const hostRows = await db.execute(sql`
      SELECT COUNT(DISTINCT host_id)::bigint AS cnt
      FROM drift_events
      WHERE tenant_id = ${tenantId}::uuid
        AND created_at >= ${windowStart.toISOString()}
    `);

    const toRecord = (
      rows: Iterable<Record<string, unknown>>,
      key: string,
    ): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const r of rows) {
        const k = String(r[key] ?? "");
        const c = Number(r.cnt ?? 0);
        if (k) out[k] = c;
      }
      return out;
    };

    const sevRowsArr = Array.isArray(sevRows)
      ? (sevRows as Record<string, unknown>[])
      : ((sevRows as { rows?: Record<string, unknown>[] }).rows ?? []);
    const lifecycleRowsArr = Array.isArray(lifecycleRows)
      ? (lifecycleRows as Record<string, unknown>[])
      : ((lifecycleRows as { rows?: Record<string, unknown>[] }).rows ?? []);
    const catRowsArr = Array.isArray(catRows)
      ? (catRows as Record<string, unknown>[])
      : ((catRows as { rows?: Record<string, unknown>[] }).rows ?? []);
    const hostRowsArr = Array.isArray(hostRows)
      ? (hostRows as Record<string, unknown>[])
      : ((hostRows as { rows?: Record<string, unknown>[] }).rows ?? []);

    const topCategories = catRowsArr
      .map((r) => ({
        category: String(r.category ?? ""),
        count: Number(r.cnt ?? 0),
      }))
      .filter((r) => r.category && r.count > 0);

    const affectedHosts =
      hostRowsArr.length > 0 ? Number(hostRowsArr[0]?.cnt ?? 0) : 0;

    return {
      countsBySeverity: toRecord(sevRowsArr, "severity"),
      countsByLifecycle: toRecord(lifecycleRowsArr, "lifecycle"),
      topCategories,
      affectedHosts,
    };
  });
}

/**
 * Build + send digests for every tenant that has alert email configured.
 *
 * Returns one row per tenant considered (including skipped) so the
 * ops-worker can log a summary and we can assert in tests that the
 * service iterates correctly.
 */
export async function runDriftDigest(): Promise<DigestRunResult[]> {
  const deploymentInterval = digestInterval();
  // Deployment-level "off" wins — when the operator has disabled digests
  // entirely the worker shouldn't fire at all (and the repeatable isn't
  // installed by `installDriftDigestRepeatable()`). Per-tenant `off`
  // still works for opting OUT of an opted-in deployment.
  if (deploymentInterval === "off") return [];
  if (!tryGetDb()) return [];

  const now = new Date();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://blackglasssec.com").replace(
    /\/+$/,
    "",
  );

  const tenants = await listTenantsWithEmail();
  const results: DigestRunResult[] = [];

  for (const tenant of tenants) {
    const to = tenant.alertEmailTo?.trim();
    const interval = effectiveTenantInterval(
      deploymentInterval,
      tenant.driftDigestCadence,
    );
    if (interval === "off") {
      results.push({
        tenantId: tenant.tenantId,
        workspaceName: tenant.workspaceName,
        to: to ?? "",
        totalsNew: 0,
        totalsHigh: 0,
        totalsRemediated: 0,
        affectedHosts: 0,
        emailSent: false,
        skippedReason: "digest_off_for_tenant",
        error: null,
      });
      continue;
    }

    const windowMs = digestWindowMs(interval);
    const windowStart = new Date(now.getTime() - windowMs);
    const windowLabel = digestWindowLabel(interval);

    if (!to) {
      results.push({
        tenantId: tenant.tenantId,
        workspaceName: tenant.workspaceName,
        to: "",
        totalsNew: 0,
        totalsHigh: 0,
        totalsRemediated: 0,
        affectedHosts: 0,
        emailSent: false,
        skippedReason: "no_alert_email_to",
        error: null,
      });
      continue;
    }
    try {
      const totals = await computeTenantTotals(tenant.tenantId, windowStart);
      const sev = totals.countsBySeverity;
      const lifecycle = totals.countsByLifecycle;
      const totalsNew = lifecycle.new ?? 0;
      const totalsRemediated =
        (lifecycle.remediated ?? 0) + (lifecycle.verified ?? 0);
      const totalsHigh = sev.high ?? 0;
      const totalsMedium = sev.medium ?? 0;
      const totalsLow = sev.low ?? 0;
      const totalEvents = totalsHigh + totalsMedium + totalsLow;

      // Don't email tenants with zero activity in the window — keeps the
      // signal-to-noise ratio high. They can still see the dashboard
      // whenever they want.
      if (totalEvents === 0 && totalsRemediated === 0) {
        results.push({
          tenantId: tenant.tenantId,
          workspaceName: tenant.workspaceName,
          to,
          totalsNew: 0,
          totalsHigh: 0,
          totalsRemediated: 0,
          affectedHosts: 0,
          emailSent: false,
          skippedReason: "no_drift_in_window",
          error: null,
        });
        continue;
      }

      const opts: DriftDigestOptions = {
        workspaceName: tenant.workspaceName,
        appUrl,
        windowLabel,
        windowStartIso: windowStart.toISOString(),
        windowEndIso: now.toISOString(),
        totals: {
          new: totalsNew,
          high: totalsHigh,
          medium: totalsMedium,
          low: totalsLow,
          remediated: totalsRemediated,
        },
        topCategories: totals.topCategories,
        affectedHosts: totals.affectedHosts,
      };

      const send = await sendEmail({
        to,
        subject:
          totalsHigh > 0
            ? `[Blackglass] ${totalsHigh} high-severity finding${totalsHigh === 1 ? "" : "s"} — ${windowLabel} digest`
            : `[Blackglass] Findings digest — ${windowLabel}`,
        html: driftDigestHtml(opts),
        text: driftDigestText(opts),
      });

      results.push({
        tenantId: tenant.tenantId,
        workspaceName: tenant.workspaceName,
        to,
        totalsNew,
        totalsHigh,
        totalsRemediated,
        affectedHosts: totals.affectedHosts,
        emailSent: !send.skipped,
        skippedReason: send.skipped ? "send_skipped" : null,
        error: null,
      });
    } catch (err) {
      results.push({
        tenantId: tenant.tenantId,
        workspaceName: tenant.workspaceName,
        to: to ?? "",
        totalsNew: 0,
        totalsHigh: 0,
        totalsRemediated: 0,
        affectedHosts: 0,
        emailSent: false,
        skippedReason: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
