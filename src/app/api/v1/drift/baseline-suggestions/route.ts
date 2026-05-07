/**
 * GET /api/v1/drift/baseline-suggestions
 *
 * Returns frequency-based baseline-promotion suggestions for the
 * current tenant. See `baseline-suggestions-service.ts` for the
 * heuristic; this endpoint is a thin RLS-scoped wrapper.
 *
 * Why this lives under `/drift/` rather than `/baselines/`:
 *   - The signal comes from drift events; the action is "stop
 *     treating this as drift". Putting it on /drift makes the
 *     surfacing in the Drift triage page natural.
 *
 * Query params:
 *   limit (default 20, capped server-side at 200)
 *
 * Auth: requires `drift.read` permission.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { getBaselineSuggestions } from "@/lib/server/services/baseline-suggestions-service";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  // dashboards.view is the closest read-only fit; every role with
  // visibility into the drift triage UI also has dashboards.view.
  const access = await requireSaasOrLegacyPermission("dashboards.view", ["operator", "admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    // Legacy single-tenant deployments don't use the partitioned
    // drift_events table the suggester reads from — return an empty
    // list rather than 501 so the UI can render the empty state.
    return NextResponse.json({ suggestions: [], requestId });
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 200);

  let suggestions;
  try {
    suggestions = await getBaselineSuggestions(access.ctx.tenant.id, limit);
  } catch (err) {
    console.error(
      `[baseline-suggestions] tenant=${access.ctx.tenant.id} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return jsonError(500, "suggestion_failed", "Could not compute suggestions.", requestId);
  }

  return NextResponse.json({
    suggestions,
    config: {
      minHosts: Number(process.env.BASELINE_SUGGESTION_MIN_HOSTS ?? 3),
      minAgeDays: Number(process.env.BASELINE_SUGGESTION_MIN_AGE_DAYS ?? 7),
    },
    requestId,
  });
}
