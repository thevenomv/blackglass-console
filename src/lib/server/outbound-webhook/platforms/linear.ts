/**
 * Linear — POST /graphql, mutation issueCreate
 * Auth: Authorization: <api-key>  (no "Bearer" prefix per Linear docs)
 * Reference: https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 */

import { APP_URL, type WebhookPayload } from "../types";
import { findingsMarkdown, highestSeverity, summaryLine } from "./format";

export function buildLinearPayload(
  payload: WebhookPayload,
  teamId: string | null,
): { body: string; extraHeaders: Record<string, string> } {
  const sev = highestSeverity(payload);
  // Linear priority: 0 = none, 1 = urgent, 2 = high, 3 = medium, 4 = low
  const priority = sev === "high" ? 1 : sev === "medium" ? 3 : 4;
  const description =
    `${summaryLine(payload)}\n\n` +
    `**Host:** \`${payload.hostname}\` · **Scan:** \`${payload.scanId}\`\n\n` +
    `### Findings\n${findingsMarkdown(payload)}\n\n` +
    `[Review in Blackglass](${APP_URL}/drift)`;
  return {
    body: JSON.stringify({
      query: `
        mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier url } }
        }
      `,
      variables: {
        input: {
          // teamId is required; if absent the GraphQL response surfaces a clear
          // validation error so the operator knows what's missing.
          teamId: teamId ?? "",
          title: summaryLine(payload),
          description,
          priority,
          labelIds: [],
        },
      },
    }),
    extraHeaders: { Accept: "application/json" },
  };
}
