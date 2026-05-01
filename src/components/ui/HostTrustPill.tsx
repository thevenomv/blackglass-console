import type { HostTrust } from "@/data/mock/types";
import { Badge } from "./Badge";

const labels: Record<HostTrust, string> = {
  aligned: "Baseline aligned",
  drift: "Baseline mismatch",
  needs_review: "Needs review",
  critical: "Privileged re-check",
};

export function HostTrustPill({ trust }: { trust: HostTrust }) {
  const tone =
    trust === "aligned"
      ? "success"
      : trust === "critical"
        ? "danger"
        : trust === "drift"
          ? "warning"
          : "warning";

  return <Badge tone={tone}>{labels[trust]}</Badge>;
}
