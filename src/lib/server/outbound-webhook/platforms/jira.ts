/**
 * Jira — POST /rest/api/3/issue
 * Auth: Basic <base64(email:api_token)>
 * Body: { fields: { project, issuetype, summary, description (ADF), priority, labels } }
 * Reference: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 */

import { APP_URL, type WebhookPayload } from "../types";
import { findingsMarkdown, highestSeverity, summaryLine } from "./format";

export function buildJiraPayload(
  payload: WebhookPayload,
  projectKey: string | null,
): { body: string; extraHeaders: Record<string, string> } {
  const sev = highestSeverity(payload);
  const priority = sev === "high" ? "Highest" : sev === "medium" ? "Medium" : "Low";
  // Atlassian Document Format (ADF) — minimal paragraph + code block.
  const description = {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: summaryLine(payload) }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: `Host: ${payload.hostname} · Scan: ${payload.scanId.slice(0, 8)}…` },
        ],
      },
      {
        type: "codeBlock",
        attrs: { language: "markdown" },
        content: [{ type: "text", text: findingsMarkdown(payload) }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Review in Blackglass: " },
          {
            type: "text",
            text: `${APP_URL}/drift`,
            marks: [{ type: "link", attrs: { href: `${APP_URL}/drift` } }],
          },
        ],
      },
    ],
  };
  return {
    body: JSON.stringify({
      fields: {
        // Project key MUST be configured; if missing we still POST and let
        // Jira reject with a clear validation error rather than fail silently.
        project: projectKey ? { key: projectKey } : {},
        issuetype: { name: "Task" },
        summary: summaryLine(payload),
        description,
        priority: { name: priority },
        labels: ["blackglass", `severity-${sev}`, `host-${payload.hostId}`],
      },
    }),
    extraHeaders: { Accept: "application/json" },
  };
}
