/**
 * GET /api/v1/saas-audit
 *
 * Query the per-tenant audit log (`saas_audit_events`) with substring +
 * actor + time-range filters and cursor pagination.
 *
 * Query params:
 *   action       — substring match (ILIKE)
 *   actor        — exact actor_user_id
 *   since        — ISO timestamp lower bound (inclusive)
 *   cursor       — ISO timestamp upper bound exclusive — pass `nextCursor` from the previous page
 *   limit        — 1–200, default 50
 *
 * Auth: evidence.view (auditor + above).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkReadApiRate, clientIp } from "@/lib/server/rate-limit";
import { listSaasAudit } from "@/lib/server/services/audit-service";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission(
    "evidence.view",
    ["auditor", "operator", "admin"],
  );
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const u = new URL(request.url);
  const limit = parseInt(u.searchParams.get("limit") ?? "50", 10);

  const page = await listSaasAudit(access.ctx.tenant.id, {
    action: u.searchParams.get("action") ?? undefined,
    actorUserId: u.searchParams.get("actor") ?? undefined,
    sinceIso: u.searchParams.get("since") ?? undefined,
    cursorIso: u.searchParams.get("cursor") ?? undefined,
    limit: Number.isFinite(limit) ? limit : 50,
  });

  return NextResponse.json(page);
}
