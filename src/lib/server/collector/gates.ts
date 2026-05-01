import { credentialSourceConfigured } from "@/lib/server/secrets";
import { collectorHasHostSlots, collectorHostSlotCount } from "@/lib/server/collector-env";

/** True when COLLECTOR_HOST_1 is set and the active SECRET_PROVIDER has required env. */
export function collectorConfigured(): boolean {
  return collectorHasHostSlots() && credentialSourceConfigured();
}

/** Number of collector hosts currently configured (0 when not fully configured). */
export function configuredHostCount(): number {
  if (!collectorConfigured()) return 0;
  return collectorHostSlotCount();
}
