/**
 * GET /api/v1/onboarding/recent-bootstraps?since=<unix-ms>
 *
 * Returns the hostIds whose baseline collectedAt is newer than `since`.
 * The wizard uses this when the user opted for "auto-detect hostId" in
 * step 1 — once we see a new bootstrap, the wizard locks onto it and
 * switches to per-host status polling.
 *
 * Cheap, read-only, safe to poll at 3s cadence. No tenant scoping at
 * the SQL level — the listBaselineHostIds() helper already respects
 * the deployment's storage scoping.
 */

import { z } from "zod";
import { hasBaseline, getBaseline, listBaselineHostIds } from "@/lib/server/baseline-store";
import { zodErrorResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { requireRole } from "@/lib/server/http/auth-guard";
import { logOnboardingEvent } from "@/lib/server/onboarding/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QuerySchema = z.object({
  since: z.coerce.number().int().min(0),
});

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (isClerkAuthEnabled()) {
    const access = await requireSaasOrLegacyPermission("reports.view", [
      "viewer",
      "auditor",
      "operator",
      "admin",
    ]);
    if (!access.ok) return access.response;
  } else {
    const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
    if (!guard.ok) return guard.response;
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ since: url.searchParams.get("since") });
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);
  const sinceMs = parsed.data.since;

  const ids = await listBaselineHostIds();
  // Inspect each baseline's collectedAt and keep only the ones that
  // landed after `since`. listBaselineHostIds is bounded — production
  // tenants have <=1000 hosts, the wizard polls ~once every 3s, the
  // map is short.
  const recent: { hostId: string; capturedAt: string }[] = [];
  for (const id of ids) {
    if (!(await hasBaseline(id))) continue;
    const baseline = await getBaseline(id);
    if (!baseline) continue;
    const ts = Date.parse(baseline.collectedAt);
    if (Number.isFinite(ts) && ts >= sinceMs) {
      recent.push({ hostId: id, capturedAt: baseline.collectedAt });
    }
  }

  // Newest first — wizard cares about the most recent bootstrap.
  recent.sort(
    (a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt),
  );

  // Only emit a log line when at least one bootstrap is observed, so we
  // don't drown the console with "0 bootstraps" lines from the wizard's
  // 3s polling loop.
  if (recent.length > 0) {
    logOnboardingEvent("onboarding.recent_bootstraps_queried", {
      tenantId: process.env.INGEST_SAAS_TENANT_ID?.trim() ?? null,
      requestId,
      outcome: "ok",
      meta: { count: recent.length, newestHostId: recent[0]!.hostId },
    });
  }

  return jsonWithRequestId({ recent }, requestId);
}
