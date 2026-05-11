/**
 * Optional Slack incoming webhook when cleanup requests are queued (HITL).
 * Interactive approvals still use SLACK_SIGNING_SECRET + /api/v1/janitor/slack.
 */

import { getTenantNotifications } from "@/lib/server/services/notifications-service";

function consoleBaseUrl(): string {
  const a = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (a) return a;
  const v = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (v) return `https://${v}`;
  return "";
}

export async function notifyCharonCleanupQueuedSlack(
  tenantId: string,
  payload: { count: number; mode: string },
): Promise<void> {
  const r = await getTenantNotifications(tenantId);
  const hook = r.slackWebhookUrl?.trim();
  if (!hook) return;

  const base = consoleBaseUrl();
  const charonConsoleUrl = base ? `${base}/charon` : "/charon";

  const body = {
    text: `Charon: ${payload.count} cleanup request(s) queued (${payload.mode}).`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Charon cleanup queue*\n${payload.count} request(s) • mode \`${payload.mode}\`\nOpen the console to approve or reject.`,
        },
      },
      ...(base
        ? [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "Open Charon" },
                  url: charonConsoleUrl,
                },
              ],
            },
          ]
        : []),
    ],
  };

  try {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // best-effort only
  }
}
