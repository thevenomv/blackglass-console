/**
 * GitHub Issues — POST /repos/{owner}/{repo}/issues
 * Auth: Authorization: Bearer <token>; X-GitHub-Api-Version: 2022-11-28
 * GitHub Issues: REST create-issue endpoint (vendor API).
 */

import { APP_URL, type WebhookPayload } from "../types";
import { findingsMarkdown, highestSeverity, summaryLine } from "./format";

export function buildGithubPayload(
  payload: WebhookPayload,
): { body: string; extraHeaders: Record<string, string> } {
  const sev = highestSeverity(payload);
  return {
    body: JSON.stringify({
      title: summaryLine(payload),
      body:
        `${summaryLine(payload)}\n\n` +
        `**Host:** \`${payload.hostname}\` · **Scan:** \`${payload.scanId}\`\n\n` +
        `### Findings\n${findingsMarkdown(payload)}\n\n` +
        `[Review in Blackglass](${APP_URL}/drift)`,
      labels: ["blackglass", `severity:${sev}`],
    }),
    extraHeaders: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  };
}
