/**
 * POST /api/v1/baselines
 * Capture the current state of the configured host as a baseline.
 * The baseline is used by the drift engine during subsequent scans.
 */

import { NextResponse } from "next/server";
import { collectSnapshot, collectorConfigured } from "@/lib/server/collector";
import { saveBaseline } from "@/lib/server/baseline-store";
import { storeDriftEvents } from "@/lib/server/drift-engine";
import { appendAudit } from "@/lib/server/audit-log";

export async function POST() {
  if (!collectorConfigured()) {
    return NextResponse.json(
      {
        error: "collector_not_configured",
        detail:
          "Set COLLECTOR_HOST_1 and SSH_PRIVATE_KEY environment variables to enable real collection.",
      },
      { status: 503 },
    );
  }

  try {
    const snapshot = await collectSnapshot();
    saveBaseline(snapshot);
    // Clear any previous drift data when a new baseline is captured
    storeDriftEvents(snapshot.hostId, []);

    appendAudit({
      action: "baseline.capture",
      detail: `Baseline captured for host ${snapshot.hostname} (${snapshot.hostId})`,
    });

    return NextResponse.json({
      hostId: snapshot.hostId,
      capturedAt: snapshot.collectedAt,
      listenersCount: snapshot.listeners.length,
      usersCount: snapshot.users.length,
      servicesCount: snapshot.services.length,
      sudoers: snapshot.sudoers,
      cronEntries: snapshot.cronEntries.map((c) => c.filename),
      sshConfig: snapshot.ssh,
      firewallActive: snapshot.firewall.active,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "collection_failed", detail: message },
      { status: 502 },
    );
  }
}

/**
 * GET /api/v1/baselines
 * Return a summary of all captured baselines.
 */
export async function GET() {
  const { listBaselineHostIds, getBaseline } = await import(
    "@/lib/server/baseline-store"
  );
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
