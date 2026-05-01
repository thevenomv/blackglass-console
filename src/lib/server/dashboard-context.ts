import type { DriftCategory, DriftEvent, HostRecord } from "@/data/mock/types";
import type { LiveDashboardDriftCategory } from "../dashboard-shared";

const CATEGORY_LABELS: Record<DriftCategory, string> = {
  network_exposure: "Network exposure",
  identity: "Identity drift",
  persistence: "Service persistence",
  ssh: "SSH posture",
  firewall: "Firewall",
  packages: "Packages",
};

export function pickSpotlightHost(hosts: HostRecord[]): HostRecord | null {
  if (hosts.length === 0) return null;
  const trustOrder: Record<HostRecord["trust"], number> = {
    critical: 0,
    drift: 1,
    needs_review: 2,
    aligned: 3,
  };
  return [...hosts].sort((a, b) => trustOrder[a.trust] - trustOrder[b.trust])[0] ?? null;
}

/** Dashboard “top classes” + CTA host from any drift list (live store or mock fallback). */
export function deriveDriftCardsFromEvents(
  events: DriftEvent[],
  spotlightHost: HostRecord | null,
): {
  driftTopCategories: LiveDashboardDriftCategory[];
  recommendedActionHostId: string | null;
} {
  if (events.length === 0) {
    return {
      driftTopCategories: [],
      recommendedActionHostId: spotlightHost?.id ?? null,
    };
  }

  const actionable = events.filter((e) => e.lifecycle === "new");
  const highNew = actionable.filter((e) => e.severity === "high");

  const recommendedActionHostId =
    highNew[0]?.hostId ?? actionable[0]?.hostId ?? spotlightHost?.id ?? null;

  const byCat = new Map<DriftCategory, number>();
  for (const e of highNew.length > 0 ? highNew : actionable) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + 1);
  }

  const driftTopCategories = [...byCat.entries()]
    .map(([category, count]) => ({ category, label: CATEGORY_LABELS[category], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { driftTopCategories, recommendedActionHostId };
}
