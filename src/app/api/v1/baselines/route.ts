/**
 * POST /api/v1/baselines
 * Capture the current state of every configured collector host as a baseline.
 * Baselines are used by the drift engine during subsequent scans.
 */

import { NextResponse } from "next/server";
import { collectorConfigured } from "@/lib/server/collector";
import { captureBaselinesFromFleet } from "@/lib/server/services/baseline-capture";
import { requireRole } from "@/lib/server/http/auth-guard";
import { checkBaselinesRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await checkBaselinesRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many baseline capture requests.");
  }

  const guard = await requireRole(["operator", "admin"]);
  if (!guard.ok) return guard.response;

  if (!collectorConfigured()) {
    return NextResponse.json(
      {
        error: "collector_not_configured",
        detail:
          "Set COLLECTOR_HOST_1 and a credential source: SSH_PRIVATE_KEY with SECRET_PROVIDER=env (default), or Doppler/Infisical per operator guide.",
      },
      { status: 503 },
    );
  }

  const outcome = await captureBaselinesFromFleet();
  switch (outcome.kind) {
    case "collection_failed":
      return NextResponse.json({ error: "collection_failed", detail: outcome.detail }, { status: 503 });
    case "exception":
      // Log the full error server-side; return a generic message to avoid
      // leaking unexpected internal details (stack traces, etc.) to the client.
      console.error("[baselines] Unexpected collection exception:", outcome.message);
      return NextResponse.json(
        { error: "collection_failed", detail: "An unexpected error occurred during collection." },
        { status: 500 },
      );
    case "ok":
      return NextResponse.json({
        captured: outcome.payload.captured,
        ...(outcome.payload.failed?.length ? { failed: outcome.payload.failed } : {}),
      });
    default:
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * GET /api/v1/baselines
 * Return a summary of all captured baselines.
 */
export async function GET() {
  const guard = await requireRole(["viewer", "auditor", "operator", "admin"]);
  if (!guard.ok) return guard.response;

  const { listBaselineHostIds, getBaseline } = await import("@/lib/server/baseline-store");
  const ids = await listBaselineHostIds();
  const baselines = await Promise.all(
    ids.map(async (id) => {
      const b = await getBaseline(id);
      return b
        ? {
            hostId: b.hostId,
            hostname: b.hostname,
            capturedAt: b.collectedAt,
            listenersCount: b.listeners.length,
            usersCount: b.users.length,
            servicesCount: b.services.length,
          }
        : { hostId: id };
    }),
  );
  return NextResponse.json({ baselines });
}
