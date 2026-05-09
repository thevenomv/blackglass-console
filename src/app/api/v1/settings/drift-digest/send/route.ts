/**
 * POST /api/v1/settings/drift-digest/send
 *
 * Triggers an on-demand drift digest email for the calling tenant.
 * Used by the "Send a test digest now" button in
 * Settings → Notifications and as a manual trigger when an admin
 * wants a fresh report between scheduled runs.
 *
 * Auth + safety:
 *   - Requires SaaS mode (the digest pulls from `saas_tenant_*`).
 *   - Requires `settings.write` (admin-equivalent) — same gate as
 *     editing the alert email itself.
 *   - Rate-limited per IP (3 sends per 10 minutes) so a stuck UI
 *     can't accidentally email-blast the recipient.
 *   - Audit-logged so we can correlate "I got a digest at 3am" with
 *     the operator that clicked the button.
 *
 * Response shape mirrors the per-tenant entry returned by
 * `runDriftDigest()` so the UI can render the same status string
 * regardless of whether the digest was scheduled or on-demand.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkContactSalesRate, clientIp } from "@/lib/server/rate-limit";
import { runDriftDigestForTenant } from "@/lib/server/services/drift-digest-service";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  // Reuse the contact-sales bucket — same envelope (3 per 10 min) is
  // perfect for "operator clicks 'send' button" velocity. Avoids
  // adding a new rate-limit bucket for a low-volume action.
  if (!(await checkContactSalesRate(clientIp(request)))) {
    return jsonError(
      429,
      "rate_limited",
      "Too many digest sends. Please wait a few minutes before trying again.",
      requestId,
    );
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(
      400,
      "not_supported",
      "Drift digests require SaaS mode (multi-tenant Postgres deployment).",
      requestId,
    );
  }

  const tenantId = access.ctx.tenant.id;
  const result = await runDriftDigestForTenant(tenantId);

  if (!result) {
    return jsonError(
      503,
      "digest_unavailable",
      "Drift digest service couldn't run — no database is wired up. This deployment is in legacy / single-tenant mode.",
      requestId,
    );
  }

  appendAudit({
    action: AUDIT_ACTIONS.DRIFT_DIGEST_SENT,
    detail: `On-demand drift digest send: emailSent=${result.emailSent} reason=${result.skippedReason ?? "ok"}`,
    request_id: requestId,
  });

  return NextResponse.json({
    ok: true,
    requestId,
    result: {
      to: result.to,
      emailSent: result.emailSent,
      skippedReason: result.skippedReason,
      error: result.error,
      totals: {
        new: result.totalsNew,
        high: result.totalsHigh,
        remediated: result.totalsRemediated,
        affectedHosts: result.affectedHosts,
      },
    },
  });
}
