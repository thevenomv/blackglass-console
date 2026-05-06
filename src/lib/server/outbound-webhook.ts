/**
 * Outbound webhook / SIEM alert dispatcher.
 *
 * Fires a POST request for every qualifying drift event to all configured
 * webhook destinations.  Works alongside the existing Slack alerting
 * (SLACK_ALERT_WEBHOOK_URL) which is maintained for backwards compat.
 *
 * Configuration (env vars):
 *
 *   WEBHOOK_URLS          — comma-separated list of HTTP(S) endpoints.
 *                           e.g. "https://hooks.slack.com/...,https://events.pagerduty.com/..."
 *
 *   WEBHOOK_MIN_SEVERITY  — minimum drift severity to dispatch.
 *                           Values: "high" (default), "medium", "low".
 *                           Set to "low" to receive everything.
 *
 *   WEBHOOK_SECRET        — optional HMAC-SHA256 signing secret.
 *                           When set, each request includes an
 *                           "X-Blackglass-Signature" header containing
 *                           hex(HMAC-SHA256(body, WEBHOOK_SECRET)).
 *
 * Payload schema (JSON):
 *   {
 *     "event": "drift.detected",
 *     "scanId": "<uuid>",
 *     "hostId": "<host-id>",
 *     "hostname": "<display-name>",
 *     "timestamp": "<ISO 8601>",
 *     "findings": [
 *       {
 *         "id": "<uuid>",
 *         "category": "<DriftCategory>",
 *         "severity": "high|medium|low",
 *         "title": "<string>",
 *         "rationale": "<string>"
 *       }
 *     ]
 *   }
 */

import { createHmac } from "node:crypto";
import type { DriftEvent } from "@/data/mock/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SeverityLevel = "high" | "medium" | "low";

const SEVERITY_RANK: Record<SeverityLevel, number> = { high: 0, medium: 1, low: 2 };

type WebhookPayload = {
  event: "drift.detected";
  scanId: string;
  hostId: string;
  hostname: string;
  timestamp: string;
  findings: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    rationale: string;
  }>;
};

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function webhookUrls(): string[] {
  return (process.env.WEBHOOK_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http://") || u.startsWith("https://"));
}

function minSeverity(): SeverityLevel {
  const raw = (process.env.WEBHOOK_MIN_SEVERITY ?? "high").trim().toLowerCase();
  if (raw === "medium" || raw === "low") return raw;
  return "high";
}

function signingSecret(): string | undefined {
  return process.env.WEBHOOK_SECRET?.trim() || undefined;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Platform detection & native formatters
// ---------------------------------------------------------------------------

type Platform = "slack" | "pagerduty" | "generic";

function detectPlatform(url: string): Platform {
  if (/hooks\.slack\.com|slack\.com\/workflows/i.test(url)) return "slack";
  if (/events\.pagerduty\.com|pagerduty\.com\/v2/i.test(url)) return "pagerduty";
  return "generic";
}

function severityEmoji(s: string): string {
  if (s === "high") return "🔴";
  if (s === "medium") return "🟡";
  return "🟢";
}

/** Build a Slack Block Kit payload for drift findings. */
function buildSlackPayload(payload: WebhookPayload): string {
  const count = payload.findings.length;
  const highCount = payload.findings.filter((f) => f.severity === "high").length;
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${highCount > 0 ? "🔴" : "🟡"} BLACKGLASS: ${count} drift finding${count === 1 ? "" : "s"} on ${payload.hostname}`,
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

/** Build a PagerDuty Events v2 payload. */
function buildPagerDutyPayload(payload: WebhookPayload): string {
  const highCount = payload.findings.filter((f) => f.severity === "high").length;
  const severity = highCount > 0 ? "critical" : payload.findings.some((f) => f.severity === "medium") ? "warning" : "info";
  const summary = `BLACKGLASS: ${payload.findings.length} drift finding(s) on ${payload.hostname}`;

  return JSON.stringify({
    routing_key: process.env.PD_ROUTING_KEY ?? "",
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
        href: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.blackglasssec.com"}/drift`,
        text: "Review in BLACKGLASS console",
      },
    ],
  });
}

async function dispatchOne(url: string, payload: WebhookPayload): Promise<void> {
  const platform = detectPlatform(url);
  const secret = signingSecret();

  let body: string;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "BLACKGLASS-Webhook/1.0",
  };

  if (platform === "slack") {
    body = buildSlackPayload(payload);
    // Slack incoming webhooks don't use HMAC — skip signature header
  } else if (platform === "pagerduty") {
    body = buildPagerDutyPayload(payload);
    // PagerDuty uses routing_key inside the body, not HMAC header
  } else {
    body = JSON.stringify(payload);
    if (secret) {
      headers["X-Blackglass-Signature"] = `sha256=${sign(body, secret)}`;
    }
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Webhook POST to ${url} → ${res.status} ${res.statusText}`);
  }
}

/**
 * Dispatch drift findings to all configured WEBHOOK_URLS.
 *
 * - Only sends findings at or above WEBHOOK_MIN_SEVERITY.
 * - Each URL receives one combined payload per host per scan.
 * - Failures are logged but never throw — alerting must not mask scan results.
 */
export async function dispatchDriftWebhook(opts: {
  scanId: string;
  hostId: string;
  hostname: string;
  events: DriftEvent[];
}): Promise<void> {
  const urls = webhookUrls();
  if (urls.length === 0) return;

  const threshold = minSeverity();
  const thresholdRank = SEVERITY_RANK[threshold];

  const qualifying = opts.events.filter(
    (e) => (SEVERITY_RANK[e.severity as SeverityLevel] ?? 99) <= thresholdRank,
  );

  if (qualifying.length === 0) return;

  const payload: WebhookPayload = {
    event: "drift.detected",
    scanId: opts.scanId,
    hostId: opts.hostId,
    hostname: opts.hostname,
    timestamp: new Date().toISOString(),
    findings: qualifying.map((e) => ({
      id: e.id,
      category: e.category,
      severity: e.severity,
      title: e.title,
      rationale: e.rationale,
    })),
  };

  await Promise.allSettled(
    urls.map((url) =>
      dispatchOne(url, payload).catch((err) => {
        console.error(
          `[outbound-webhook] Failed delivery to ${url}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }),
    ),
  );
}

/**
 * Send a synthetic test event to a single URL.
 * Used by the settings UI "Send test" button via POST /api/v1/webhooks/test.
 */
export async function sendTestWebhook(url: string): Promise<void> {
  const payload: WebhookPayload = {
    event: "drift.detected",
    scanId: "test-00000000-0000-0000-0000-000000000000",
    hostId: "host-test",
    hostname: "test-host.example.com",
    timestamp: new Date().toISOString(),
    findings: [
      {
        id: "00000000-0000-0000-0000-000000000001",
        category: "privilege_escalation",
        severity: "high",
        title: "Test: sudo group membership changed",
        rationale:
          "This is a synthetic BLACKGLASS test event — no action required.",
      },
    ],
  };
  await dispatchOne(url, payload);
}
