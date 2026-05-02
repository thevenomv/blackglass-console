import { getDriftEvent } from "@/data/mock/drift";
import type { DriftEvent } from "@/data/mock/types";
import { collectorConfigured } from "@/lib/server/collector";
import { getDriftEvents, hasDriftData } from "@/lib/server/drift-engine";

const HOST_FINDING_TO_EVENT: Record<string, string> = {
  "host-07:tcp-4444": "d-001",
  "host-03:sudo-user": "d-002",
  "host-09:systemd": "d-003",
};

export function resolveDriftInvestigation(
  hostId: string,
  opts: { findingSlug?: string; eventId?: string },
): DriftEvent | undefined {
  // When real collector data is available, search the live drift engine first.
  if (collectorConfigured() && hasDriftData()) {
    const events = getDriftEvents(hostId);
    if (opts.eventId) {
      const found = events.find((e) => e.id === opts.eventId);
      if (found) return found;
    }
    if (opts.findingSlug) {
      const found = events.find(
        (e) =>
          e.id === opts.findingSlug ||
          e.category === opts.findingSlug ||
          e.title.toLowerCase().includes(opts.findingSlug!.toLowerCase()),
      );
      if (found) return found;
    }
    // Fall through to mock only if nothing matched in real data.
  }

  // Mock fallback (demo / dev mode).
  if (opts.eventId) return getDriftEvent(opts.eventId);
  if (opts.findingSlug) {
    const id = HOST_FINDING_TO_EVENT[`${hostId}:${opts.findingSlug}`];
    if (id) return getDriftEvent(id);
  }
  return undefined;
}
