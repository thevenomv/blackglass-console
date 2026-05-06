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

async function dispatchOne(url: string, payload: WebhookPayload): Promise<void> {
  const body = JSON.stringify(payload);
  const secret = signingSecret();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "BLACKGLASS-Webhook/1.0",
  };
  if (secret) {
    headers["X-Blackglass-Signature"] = `sha256=${sign(body, secret)}`;
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
