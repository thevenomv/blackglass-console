/**
 * ServiceNow — POST /api/now/table/incident
 * Auth: Basic <base64(user:password)>
 * Body: { short_description, description, urgency, impact, ... }
 * Reference: https://developer.servicenow.com/dev.do
 */

import { APP_URL, type WebhookPayload } from "../types";
import { findingsPlainText, highestSeverity, summaryLine } from "./format";

export function buildServiceNowPayload(
  payload: WebhookPayload,
): { body: string; extraHeaders: Record<string, string> } {
  const sev = highestSeverity(payload);
  // ServiceNow incident scale: 1 = high, 2 = medium, 3 = low
  const urgency = sev === "high" ? 1 : sev === "medium" ? 2 : 3;
  return {
    body: JSON.stringify({
      short_description: summaryLine(payload),
      description:
        `${summaryLine(payload)}\n\n` +
        `Host: ${payload.hostname}\n` +
        `Scan: ${payload.scanId}\n` +
        `Detected: ${payload.timestamp}\n\n` +
        `Findings:\n${findingsPlainText(payload)}\n\n` +
        `Review: ${APP_URL}/drift`,
      urgency: String(urgency),
      impact: String(urgency),
      category: "Security",
      subcategory: "Configuration drift",
      caller_id: "blackglass.bot",
      // dedupe via correlation_id so a re-run of the same scan updates the same incident
      correlation_id: `blackglass-${payload.scanId}-${payload.hostId}`,
      correlation_display: "Blackglass drift scan",
    }),
    extraHeaders: { Accept: "application/json" },
  };
}
