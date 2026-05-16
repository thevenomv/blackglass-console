/**
 * Microsoft Sentinel — CEF (Common Event Format) over HTTP
 * CEF is a single line per event in the form:
 *   CEF:0|Vendor|Product|Version|SignatureID|Name|Severity|Extension
 * Multiple events are newline-separated. Sent as text/plain so a Sentinel CEF
 * connector or relay can ingest without further transform.
 * Reference: https://learn.microsoft.com/en-us/azure/sentinel/connect-cef-syslog
 */

import { APP_URL, type WebhookPayload } from "../types";

function escapeCefHeader(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function escapeCefExtension(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/=/g, "\\=").replace(/\r?\n/g, "\\n");
}

export function buildSentinelCefPayload(
  payload: WebhookPayload,
): { body: string; extraHeaders: Record<string, string> } {
  // CEF severity scale is 0–10. Map our levels into that range.
  const sevNum: Record<string, number> = { high: 9, medium: 6, low: 3 };
  const epochMs = new Date(payload.timestamp).getTime();
  const lines = payload.findings.map((f) => {
    const sig = `Blackglass-${f.category.toUpperCase()}`;
    const ext = [
      `rt=${epochMs}`,
      `dvchost=${escapeCefExtension(payload.hostname)}`,
      `dvcid=${escapeCefExtension(payload.hostId)}`,
      `cs1Label=ScanId cs1=${escapeCefExtension(payload.scanId)}`,
      `cs2Label=Category cs2=${escapeCefExtension(f.category)}`,
      `cs3Label=ReviewUrl cs3=${escapeCefExtension(`${APP_URL}/drift`)}`,
      `msg=${escapeCefExtension(f.rationale)}`,
    ].join(" ");
    return `CEF:0|Blackglass|Blackglass|1.0|${escapeCefHeader(sig)}|${escapeCefHeader(f.title)}|${sevNum[f.severity] ?? 3}|${ext}`;
  });
  return {
    body: lines.join("\n") + "\n",
    extraHeaders: { "Content-Type": "text/plain", Accept: "*/*" },
  };
}
