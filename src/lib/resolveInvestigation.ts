import { getDriftEvent } from "@/data/mock/drift";
import type { DriftEvent } from "@/data/mock/types";

const HOST_FINDING_TO_EVENT: Record<string, string> = {
  "host-07:tcp-4444": "d-001",
  "host-03:sudo-user": "d-002",
  "host-09:systemd": "d-003",
};

export function resolveDriftInvestigation(
  hostId: string,
  opts: { findingSlug?: string; eventId?: string },
): DriftEvent | undefined {
  if (opts.eventId) return getDriftEvent(opts.eventId);
  if (opts.findingSlug) {
    const id = HOST_FINDING_TO_EVENT[`${hostId}:${opts.findingSlug}`];
    if (id) return getDriftEvent(id);
  }
  return undefined;
}
