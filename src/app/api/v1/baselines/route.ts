/**
 * POST /api/v1/baselines
 * Capture the current state of every configured collector host as a baseline.
 * Baselines are used by the drift engine during subsequent scans.
 */

import { NextResponse } from "next/server";
import { collectorConfigured } from "@/lib/server/collector";
import { captureBaselinesFromFleet } from "@/lib/server/services/baseline-capture";

export async function POST() {
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
      return NextResponse.json({ error: "collection_failed", detail: outcome.detail }, { status: 502 });
    case "exception":
      return NextResponse.json(
        { error: "collection_failed", detail: outcome.message },
        { status: 502 },
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
  const { listBaselineHostIds, getBaseline } = await import("@/lib/server/baseline-store");
  const ids = listBaselineHostIds();
  const baselines = ids.map((id) => {
    const b = getBaseline(id);
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
  });
  return NextResponse.json({ baselines });
}
