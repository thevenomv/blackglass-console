/**
 * Outbound webhook / SIEM alert dispatcher — public API surface.
 *
 * Fires a POST request for every qualifying drift event to all configured
 * webhook destinations.  Works alongside the existing Slack alerting
 * (SLACK_ALERT_WEBHOOK_URL) which is maintained for backwards compat.
 *
 * File layout (see REFACTOR.md):
 *   types.ts       — pure types + constants
 *   signing.ts     — HMAC body signing
 *   config.ts      — routing + threshold helpers
 *   platforms/     — one builder per integration target
 *   dispatch.ts    — body/header assembly + HTTP delivery
 *   index.ts       — this file: public entry-points only
 *
 * Configuration (env vars):
 *
 *   WEBHOOK_URLS          — comma-separated list of HTTP(S) endpoints.
 *
 *   WEBHOOK_MIN_SEVERITY  — minimum drift severity to dispatch.
 *                           Values: "high" (default), "medium", "low".
 *
 *   WEBHOOK_SECRET        — optional HMAC-SHA256 signing secret. When set,
 *                           each request includes "X-Blackglass-Signature".
 */

import type { DriftEvent } from "@/data/mock/types";
import { getTenantNotifications } from "@/lib/server/services/notifications-service";
import { shouldSkipForAirgap } from "@/lib/server/airgap";
import { enqueueWebhookDelivery } from "@/lib/server/queue/webhook-queue";
import { applyAirgapFilter, minSeverity, webhookUrls } from "./config";
import { applySignatureHeaders } from "./signing";
import { buildBodyAndHeaders, deliverWebhookInline, dispatchOne } from "./dispatch";
import {
  detectPlatform,
  buildServiceNowPayload,
  buildJiraPayload,
  buildDatadogPayload,
  buildLinearPayload,
  buildGithubPayload,
  buildSplunkPayload,
  buildAsffPayload,
  buildSentinelCefPayload,
  buildOcsfPayload,
} from "./platforms";
import {
  type IntegrationCreds,
  type SigningKeys,
  type WebhookPayload,
  MAX_PAYLOAD_FINDINGS,
  SEVERITY_RANK,
  type SeverityLevel,
} from "./types";

export { deliverWebhookInline };

/**
 * Dispatch drift findings to all configured WEBHOOK_URLS.
 *
 * - Only sends findings at or above WEBHOOK_MIN_SEVERITY.
 * - Each URL receives one combined payload per host per scan.
 * - Findings are capped at MAX_PAYLOAD_FINDINGS; the original count is preserved
 *   in `totalFindings` so receivers can know when output was truncated.
 * - Failures are logged but never throw — alerting must not mask scan results.
 */
export async function dispatchDriftWebhook(opts: {
  scanId: string;
  /** Saas tenant id — required for routing in the remediator and per-tenant SIEMs. */
  tenantId?: string;
  hostId: string;
  hostname: string;
  events: DriftEvent[];
}): Promise<void> {
  const routing = await getTenantNotifications(opts.tenantId);
  const urls = applyAirgapFilter(routing.webhookUrls);
  if (urls.length === 0) return;

  const threshold = minSeverity();
  const thresholdRank = SEVERITY_RANK[threshold];

  const qualifying = opts.events.filter(
    (e) => (SEVERITY_RANK[e.severity as SeverityLevel] ?? 99) <= thresholdRank,
  );

  if (qualifying.length === 0) return;

  const totalFindings = qualifying.length;
  const truncated = qualifying.slice(0, MAX_PAYLOAD_FINDINGS);

  const payload: WebhookPayload = {
    event: "drift.detected",
    scanId: opts.scanId,
    ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
    hostId: opts.hostId,
    hostname: opts.hostname,
    timestamp: new Date().toISOString(),
    totalFindings,
    findings: truncated.map((e) => ({
      id: e.id,
      category: e.category,
      severity: e.severity,
      title: e.title,
      rationale: e.rationale,
    })),
  };

  // Slice the routing record so dispatchOne can stay narrow on its argument
  // shape — easier to mock in tests + keeps the platform builders pure.
  const creds: IntegrationCreds = {
    servicenowAuth: routing.servicenowAuth,
    jiraAuth: routing.jiraAuth,
    jiraProjectKey: routing.jiraProjectKey,
    datadogApiKey: routing.datadogApiKey,
    linearApiKey: routing.linearApiKey,
    linearTeamId: routing.linearTeamId,
    githubToken: routing.githubToken,
    splunkHecToken: routing.splunkHecToken,
    awsAccountId: routing.awsAccountId,
    awsRegion: routing.awsRegion,
  };
  // Per-tenant signing keys override WEBHOOK_SECRET; the previous key is
  // populated only while we're inside the rotation overlap window.
  const signingKeys: SigningKeys = {
    current: routing.webhookSigningKey,
    previous: routing.webhookSigningKeyPrevious,
  };

  await Promise.allSettled(
    urls.map((url) =>
      dispatchOne(url, payload, routing.pdRoutingKey, creds, signingKeys).catch((err) => {
        console.error(
          `[outbound-webhook] Failed delivery to ${url}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }),
    ),
  );
}

/**
 * POST JSON to every tenant-configured webhook URL with the same HMAC headers as generic drift payloads.
 * Intended for non-drift events (e.g. Charon). Delivery failures are logged only.
 */
export async function dispatchTenantJsonWebhooks(opts: {
  tenantId: string;
  /** Correlation id for queued webhook jobs. */
  scanId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const routing = await getTenantNotifications(opts.tenantId);
  const urls = applyAirgapFilter(routing.webhookUrls);
  if (urls.length === 0) return;

  const body = JSON.stringify(opts.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Blackglass-Webhook/1.0",
  };
  applySignatureHeaders(
    headers,
    body,
    routing.webhookSigningKey,
    routing.webhookSigningKeyPrevious,
  );

  for (const url of urls) {
    try {
      let queued = false;
      try {
        queued = await enqueueWebhookDelivery({
          url,
          body,
          headers,
          tenantId: opts.tenantId,
          scanId: opts.scanId,
        });
      } catch (err) {
        console.error("[outbound-webhook] enqueue failed, inline fallback:", err);
      }
      if (!queued) {
        await deliverWebhookInline(url, body, headers);
      }
    } catch (e) {
      console.warn(
        "[outbound-webhook] tenant JSON webhook failed",
        url,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

// Drop unused webhookUrls() helper — kept exported only for backwards compat
// with any caller that still imports it; resolves to env-only routing when
// invoked without a tenant context.
export { webhookUrls };

/**
 * Send a synthetic test event to a single URL.
 * Used by the settings UI "Send test" button via POST /api/v1/webhooks/test.
 *
 * Pulls per-platform credentials from the env-var routing so a test URL
 * pointing at e.g. a Jira / ServiceNow / Datadog endpoint authenticates
 * the same way a real drift dispatch would.
 */
export async function sendTestWebhook(url: string, pdRoutingKey?: string | null): Promise<void> {
  if (shouldSkipForAirgap("webhook test", url)) {
    throw new Error(
      "Outbound webhook tests are disabled while BLACKGLASS_AIRGAPPED is on. " +
      "Use an internal hostname (RFC1918, *.internal, *.svc.cluster.local) to verify routing.",
    );
  }
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
          "This is a synthetic Blackglass test event — no action required.",
      },
    ],
  };
  const routing = await getTenantNotifications(undefined);
  const creds: IntegrationCreds = {
    servicenowAuth: routing.servicenowAuth,
    jiraAuth: routing.jiraAuth,
    jiraProjectKey: routing.jiraProjectKey,
    datadogApiKey: routing.datadogApiKey,
    linearApiKey: routing.linearApiKey,
    linearTeamId: routing.linearTeamId,
    githubToken: routing.githubToken,
    splunkHecToken: routing.splunkHecToken,
    awsAccountId: routing.awsAccountId,
    awsRegion: routing.awsRegion,
  };
  const signingKeys: SigningKeys = {
    current: routing.webhookSigningKey,
    previous: routing.webhookSigningKeyPrevious,
  };
  // Test deliveries always go inline so the operator gets immediate feedback
  // and a hard error when the URL is misconfigured.
  const { body, headers } = buildBodyAndHeaders(url, payload, pdRoutingKey ?? null, creds, signingKeys);
  await deliverWebhookInline(url, body, headers);
}

/**
 * Internals exposed for unit tests only — do not import from production code.
 * Wrapped in an object so the export site is grep-able and callers can't
 * accidentally pull these functions into the public API surface.
 */
export const __internals = {
  detectPlatform,
  buildBodyAndHeaders,
  applySignatureHeaders,
  buildServiceNowPayload,
  buildJiraPayload,
  buildDatadogPayload,
  buildLinearPayload,
  buildGithubPayload,
  buildSplunkPayload,
  buildAsffPayload,
  buildSentinelCefPayload,
  buildOcsfPayload,
};
