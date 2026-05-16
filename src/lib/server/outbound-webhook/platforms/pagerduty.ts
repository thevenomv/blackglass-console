/**
 * PagerDuty Events API v2 — incident trigger payload.
 *
 * Reference: https://developer.pagerduty.com/docs/events-api-v2/overview/
 */

import { APP_URL, type WebhookPayload } from "../types";

/** Build a PagerDuty Events v2 payload. */
export function buildPagerDutyPayload(payload: WebhookPayload, pdRoutingKey: string | null): string {
  const highCount = payload.findings.filter((f) => f.severity === "high").length;
  const severity = highCount > 0 ? "critical" : payload.findings.some((f) => f.severity === "medium") ? "warning" : "info";
  const summary = `Blackglass: ${payload.findings.length} finding(s) on ${payload.hostname}`;

  return JSON.stringify({
    routing_key: pdRoutingKey ?? "",
    event_action: "trigger",
    dedup_key: `blackglass-${payload.scanId}`,
    payload: {
      summary,
      severity,
      source: payload.hostname,
      timestamp: payload.timestamp,
      component: "drift-scanner",
      group: payload.hostId,
      custom_details: {
        scan_id: payload.scanId,
        findings_count: payload.findings.length,
        high_severity_count: highCount,
        findings: payload.findings.slice(0, 20).map((f) => ({
          title: f.title,
          category: f.category,
          severity: f.severity,
        })),
      },
    },
    links: [
      {
        href: `${APP_URL}/drift`,
        text: "Review in Blackglass console",
      },
    ],
  });
}
