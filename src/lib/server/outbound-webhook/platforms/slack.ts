/**
 * Slack incoming webhook — Block Kit payload for drift findings.
 *
 * Reference: https://api.slack.com/messaging/webhooks
 */

import type { WebhookPayload } from "../types";
import { severityEmoji } from "./format";

/** Build a Slack Block Kit payload for drift findings. */
export function buildSlackPayload(payload: WebhookPayload): string {
  const count = payload.findings.length;
  const highCount = payload.findings.filter((f) => f.severity === "high").length;
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${highCount > 0 ? "🔴" : "🟡"} Blackglass: ${count} finding${count === 1 ? "" : "s"} on ${payload.hostname}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Host*\n${payload.hostname}` },
        { type: "mrkdwn", text: `*Scan ID*\n\`${payload.scanId.slice(0, 8)}\`` },
        { type: "mrkdwn", text: `*Detected*\n${payload.timestamp.slice(0, 16).replace("T", " ")} UTC` },
        { type: "mrkdwn", text: `*High severity*\n${highCount} / ${count}` },
      ],
    },
    { type: "divider" },
    ...payload.findings.slice(0, 10).map((f) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${severityEmoji(f.severity)} *${f.title}*\n_${f.category}_ — ${f.rationale ?? ""}`,
      },
    })),
    ...(payload.findings.length > 10
      ? [{ type: "section", text: { type: "mrkdwn", text: `_…and ${payload.findings.length - 10} more findings._` } }]
      : []),
  ];
  return JSON.stringify({ blocks });
}
