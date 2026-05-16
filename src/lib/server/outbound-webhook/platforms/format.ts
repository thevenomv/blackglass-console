/**
 * Shared formatting helpers used by every per-platform payload builder.
 *
 * Pure functions over `WebhookPayload` — no env, no IO, no platform-specific
 * knowledge.  Anything that needs branching by platform belongs in the
 * platform's own file.
 */

import type { WebhookPayload } from "../types";

export function highestSeverity(payload: WebhookPayload): "high" | "medium" | "low" {
  if (payload.findings.some((f) => f.severity === "high")) return "high";
  if (payload.findings.some((f) => f.severity === "medium")) return "medium";
  return "low";
}

export function summaryLine(payload: WebhookPayload): string {
  const high = payload.findings.filter((f) => f.severity === "high").length;
  return `Blackglass: ${payload.findings.length} finding${payload.findings.length === 1 ? "" : "s"} on ${payload.hostname}${high > 0 ? ` (${high} high)` : ""}`;
}

export function findingsMarkdown(payload: WebhookPayload, max = 10): string {
  const lines = payload.findings.slice(0, max).map((f) => `- **[${f.severity.toUpperCase()}]** ${f.title} _(${f.category})_ — ${f.rationale}`);
  if (payload.findings.length > max) {
    lines.push(`- _…and ${payload.findings.length - max} more findings._`);
  }
  return lines.join("\n");
}

export function findingsPlainText(payload: WebhookPayload, max = 10): string {
  const lines = payload.findings.slice(0, max).map((f) => `[${f.severity.toUpperCase()}] ${f.title} (${f.category}) — ${f.rationale}`);
  if (payload.findings.length > max) {
    lines.push(`…and ${payload.findings.length - max} more findings.`);
  }
  return lines.join("\n");
}

export function severityEmoji(s: string): string {
  if (s === "high") return "🔴";
  if (s === "medium") return "🟡";
  return "🟢";
}
