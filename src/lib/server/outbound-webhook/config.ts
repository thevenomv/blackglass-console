/**
 * Routing + threshold config helpers for the outbound webhook dispatcher.
 */

import { getTenantNotifications } from "@/lib/server/services/notifications-service";
import { shouldSkipForAirgap } from "@/lib/server/airgap";
import type { SeverityLevel } from "./types";

export async function webhookUrls(tenantId: string | undefined): Promise<string[]> {
  const routing = await getTenantNotifications(tenantId);
  return routing.webhookUrls;
}

/**
 * Air-gap filter applied to a list of outbound URLs. In air-gapped
 * mode we strip any URL whose host isn't on the internal allow-list,
 * so a customer who accidentally configures a Slack webhook in an
 * air-gapped deployment doesn't block the rest of the dispatcher.
 */
export function applyAirgapFilter(urls: string[]): string[] {
  return urls.filter((u) => !shouldSkipForAirgap("webhook", u));
}

export function minSeverity(): SeverityLevel {
  const raw = (process.env.WEBHOOK_MIN_SEVERITY ?? "high").trim().toLowerCase();
  if (raw === "medium" || raw === "low") return raw;
  return "high";
}
