/**
 * Baseline capture domain logic for POST /api/v1/baselines — route maps results to HTTP.
 */
import {
  collectAllSnapshots,
  type HostSnapshot,
} from "@/lib/server/collector";
import { saveBaseline } from "@/lib/server/baseline-store";
import { storeDriftEvents } from "@/lib/server/drift-engine";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { StoreError } from "@/lib/server/store/types";
import { revalidateIntegritySurfaces } from "@/lib/server/integrity-revalidate";

function snapshotSummary(snapshot: HostSnapshot) {
  return {
    hostId: snapshot.hostId,
    hostname: snapshot.hostname,
    capturedAt: snapshot.collectedAt,
    listenersCount: snapshot.listeners.length,
    usersCount: snapshot.users.length,
    servicesCount: snapshot.services.length,
    sudoers: snapshot.sudoers,
    cronEntries: snapshot.cronEntries.map((c) => c.filename),
    sshConfig: snapshot.ssh,
    firewallActive: snapshot.firewall.active,
  };
}

export type BaselineCaptureSuccess = {
  captured: ReturnType<typeof snapshotSummary>[];
  failed?: { hostId: string; detail: string }[];
};

export type BaselineCaptureOutcome =
  | { kind: "collection_failed"; detail: string }
  | { kind: "ok"; payload: BaselineCaptureSuccess }
  | { kind: "exception"; message: string };

export async function captureBaselinesFromFleet(): Promise<BaselineCaptureOutcome> {
  try {
    const results = await collectAllSnapshots({ reason: "baseline" });
    const failures = results.filter((r) => r.error);
    const successes = results.filter((r) => r.snapshot);

    if (successes.length === 0) {
      const detail =
        failures.map((f) => `${f.hostId}: ${f.error}`).join("; ") || "All hosts failed collection";
      return { kind: "collection_failed", detail };
    }

    for (const { snapshot } of successes) {
      if (!snapshot) continue;
      await saveBaseline(snapshot);
      storeDriftEvents(snapshot.hostId, []);
    }

    const captured = successes.map(({ snapshot }) => snapshotSummary(snapshot!));
    const failed = failures.map(({ hostId, error }) => ({
      hostId,
      detail: error ?? "unknown error",
    }));

    const hostLabels = successes
      .map(({ snapshot }) => (snapshot ? `${snapshot.hostname} (${snapshot.hostId})` : ""))
      .filter(Boolean);

    appendAudit({
      action: AUDIT_ACTIONS.BASELINE_CAPTURE,
      detail: `Baseline captured for ${hostLabels.join(", ")}`,
    });

    revalidateIntegritySurfaces();

    return {
      kind: "ok",
      payload: {
        captured,
        ...(failed.length > 0 ? { failed } : {}),
      },
    };
  } catch (err) {
    if (err instanceof StoreError) {
      return { kind: "collection_failed", detail: `Baseline store: ${err.message}` };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "exception", message };
  }
}
