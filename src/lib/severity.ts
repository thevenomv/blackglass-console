import type { DriftSeverity } from "@/data/mock/types";

/** Maps a drift severity to a Badge tone. */
export function severityToTone(s: DriftSeverity): "danger" | "warning" | "neutral" {
  if (s === "high") return "danger";
  if (s === "medium") return "warning";
  return "neutral";
}

/** Small accessible icon to accompany severity colour coding. */
export const SEVERITY_ICON: Record<DriftSeverity, string> = {
  high: "●",
  medium: "▲",
  low: "○",
};
