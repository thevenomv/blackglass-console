/**
 * POST /api/v1/drift/accept-baseline
 *
 * Marks selected drift findings as accepted into the new baseline:
 *   1. Removes the selected event IDs from the in-process drift store.
 *   2. Attempts a live baseline re-capture for each affected host.
 *   3. Emits a BASELINE_ACCEPTED audit entry.
 *
 * Body: { eventIds: string[] }
 * Response: { accepted: number, hostsCaptured: string[], failed: {hostId, detail}[] }
 *
 * Requires: baselines.manage permission
 */

import { NextResponse } from "next/server";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkBaselinesRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { getDriftEventsAsync, storeDriftEvents } from "@/lib/server/drift-engine";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { revalidateIntegritySurfaces } from "@/lib/server/integrity-revalidate";
import { emitSaasAudit } from "@/lib/saas/event-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkBaselinesRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many requests.", requestId);
  }

  const access = await requireSaasOrLegacyPermission("baselines.manage", [
    "operator",
    "admin",
  ]);
  if (!access.ok) return access.response;

  const saasCtx = access.mode === "saas" ? access.ctx : null;

  let body: { eventIds?: unknown };
  try {
    body = (await request.json()) as { eventIds?: unknown };
  } catch {
    return jsonError(400, "invalid_json", "Request body must be JSON.", requestId);
  }

  if (!Array.isArray(body.eventIds) || body.eventIds.length === 0) {
    return jsonError(400, "missing_event_ids", "eventIds must be a non-empty array.", requestId);
  }

  const eventIds = new Set<string>(
    (body.eventIds as unknown[]).filter((id): id is string => typeof id === "string"),
  );

  if (eventIds.size === 0) {
    return jsonError(400, "invalid_event_ids", "eventIds must contain string values.", requestId);
  }

  // ------------------------------------------------------------------
  // Collect all events, find the ones being accepted, group by host
  // ------------------------------------------------------------------
  const allEvents = await getDriftEventsAsync();
  const accepted = allEvents.filter((e) => eventIds.has(e.id));
  const affectedHostIds = [...new Set(accepted.map((e) => e.hostId))];

  if (accepted.length === 0) {
    return jsonError(404, "events_not_found", "None of the specified event IDs were found.", requestId);
  }

  // ------------------------------------------------------------------
  // Remove the accepted events from the store (per-host)
  // ------------------------------------------------------------------
  for (const hostId of affectedHostIds) {
    const hostEvents = await getDriftEventsAsync(hostId);
    const remaining = hostEvents.filter((e) => !eventIds.has(e.id));
    storeDriftEvents(hostId, remaining);
  }

  // ------------------------------------------------------------------
  // Attempt live baseline re-capture for affected hosts (best-effort)
  // ------------------------------------------------------------------
  const hostsCaptured: string[] = [];
  const failed: { hostId: string; detail: string }[] = [];

  for (const hostId of affectedHostIds) {
    try {
      // Lazy import to avoid pulling SSH deps into every request
      const { collectSnapshot } = await import("@/lib/server/collector");
      const { saveBaseline } = await import("@/lib/server/baseline-store");
      const snap = await collectSnapshot({ hostIds: [hostId], reason: "baseline" });
      await saveBaseline(snap);
      hostsCaptured.push(hostId);
    } catch (err) {
      // Best-effort — we already removed the events, so the drift list is clean
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[accept-baseline] Re-capture failed for ${hostId}: ${detail}`);
      failed.push({ hostId, detail });
    }
  }

  // ------------------------------------------------------------------
  // Audit log
  // ------------------------------------------------------------------
  const summary = `${accepted.length} finding(s) accepted as new baseline on host(s): ${affectedHostIds.join(", ")}`;
  await appendAudit(AUDIT_ACTIONS.BASELINE_ACCEPTED ?? "baseline_accepted", summary);

  if (saasCtx) {
    await emitSaasAudit(saasCtx, "baseline_accepted", {
      eventCount: accepted.length,
      hostIds: affectedHostIds,
      eventIds: [...eventIds],
    });
  }

  revalidateIntegritySurfaces();

  return NextResponse.json(
    {
      accepted: accepted.length,
      hostsCaptured,
      failed,
    },
    { headers: { "x-request-id": requestId } },
  );
}
