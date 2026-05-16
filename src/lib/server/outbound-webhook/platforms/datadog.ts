/**
 * Datadog Events API — POST /api/v1/events
 * Auth: DD-API-KEY header
 * Body: { title, text, alert_type, priority, host, tags, aggregation_key }
 * Reference: https://docs.datadoghq.com/api/latest/events/#post-an-event
 */

import { APP_URL, type WebhookPayload } from "../types";
import { findingsMarkdown, highestSeverity, summaryLine } from "./format";

export function buildDatadogPayload(
  payload: WebhookPayload,
): { body: string; extraHeaders: Record<string, string> } {
  const sev = highestSeverity(payload);
  const alertType = sev === "high" ? "error" : sev === "medium" ? "warning" : "info";
  return {
    body: JSON.stringify({
      title: summaryLine(payload),
      text:
        `%%%\n` +
        `${findingsMarkdown(payload)}\n\n` +
        `[Review in Blackglass](${APP_URL}/drift)\n` +
        `%%%`,
      alert_type: alertType,
      priority: sev === "high" ? "normal" : "low",
      host: payload.hostname,
      tags: [
        "service:blackglass",
        `severity:${sev}`,
        `scan_id:${payload.scanId}`,
        `host_id:${payload.hostId}`,
      ],
      aggregation_key: `blackglass-${payload.hostId}`,
      source_type_name: "Blackglass",
    }),
    extraHeaders: { Accept: "application/json" },
  };
}
