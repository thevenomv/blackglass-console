/**
 * Splunk HEC — POST /services/collector/event
 * Auth: Authorization: Splunk <hec-token>
 * Body: { event, sourcetype, source, host, time }
 * HEC accepts multiple events concatenated as a stream; we send one event per
 * host scan to stay compatible with the simpler "raw event" mode.
 * Reference: https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector
 */

import { APP_URL, type WebhookPayload } from "../types";
import { highestSeverity } from "./format";

export function buildSplunkPayload(
  payload: WebhookPayload,
): { body: string; extraHeaders: Record<string, string> } {
  const epoch = Math.floor(new Date(payload.timestamp).getTime() / 1000);
  return {
    body: JSON.stringify({
      time: epoch,
      host: payload.hostname,
      source: `blackglass:${payload.hostId}`,
      sourcetype: "blackglass:drift",
      index: process.env.SPLUNK_HEC_INDEX?.trim() || "main",
      event: {
        event: payload.event,
        scanId: payload.scanId,
        tenantId: payload.tenantId,
        hostId: payload.hostId,
        hostname: payload.hostname,
        severity: highestSeverity(payload),
        totalFindings: payload.totalFindings ?? payload.findings.length,
        findings: payload.findings,
        review_url: `${APP_URL}/drift`,
      },
    }),
    extraHeaders: { Accept: "application/json" },
  };
}
