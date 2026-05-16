/**
 * Body+header assembly and HTTP delivery for a single outbound webhook.
 *
 * `buildBodyAndHeaders` is the platform router: it picks the right builder
 * from `./platforms/`, attaches the right Authorization header, then defers
 * to `signing.ts` for HMAC signatures where applicable.
 *
 * `deliverWebhookInline` is the inline HTTP POST primitive — used when
 * Redis isn't configured and as the worker's delivery function.
 *
 * `dispatchOne` is the in-process tactic: try the queue, fall back to inline.
 */

import { enqueueWebhookDelivery } from "@/lib/server/queue/webhook-queue";
import type { IntegrationCreds, SigningKeys, WebhookPayload } from "./types";
import { applySignatureHeaders } from "./signing";
import {
  buildAsffPayload,
  buildDatadogPayload,
  buildGithubPayload,
  buildJiraPayload,
  buildLinearPayload,
  buildOcsfPayload,
  buildPagerDutyPayload,
  buildSentinelCefPayload,
  buildServiceNowPayload,
  buildSlackPayload,
  buildSplunkPayload,
  detectPlatform,
} from "./platforms";

export function buildBodyAndHeaders(
  url: string,
  payload: WebhookPayload,
  pdRoutingKey: string | null,
  creds: IntegrationCreds,
  signingKeys: SigningKeys = { current: null, previous: null },
): { body: string; headers: Record<string, string> } {
  const platform = detectPlatform(url);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Blackglass-Webhook/1.0",
  };
  let body: string;

  if (platform === "slack") {
    body = buildSlackPayload(payload);
  } else if (platform === "pagerduty") {
    body = buildPagerDutyPayload(payload, pdRoutingKey);
  } else if (platform === "servicenow") {
    const built = buildServiceNowPayload(payload);
    body = built.body;
    Object.assign(headers, built.extraHeaders);
    if (creds.servicenowAuth) {
      headers["Authorization"] = `Basic ${Buffer.from(creds.servicenowAuth, "utf8").toString("base64")}`;
    }
  } else if (platform === "jira") {
    const built = buildJiraPayload(payload, creds.jiraProjectKey);
    body = built.body;
    Object.assign(headers, built.extraHeaders);
    if (creds.jiraAuth) {
      headers["Authorization"] = `Basic ${Buffer.from(creds.jiraAuth, "utf8").toString("base64")}`;
    }
  } else if (platform === "datadog") {
    const built = buildDatadogPayload(payload);
    body = built.body;
    Object.assign(headers, built.extraHeaders);
    if (creds.datadogApiKey) {
      headers["DD-API-KEY"] = creds.datadogApiKey;
    }
  } else if (platform === "linear") {
    const built = buildLinearPayload(payload, creds.linearTeamId);
    body = built.body;
    Object.assign(headers, built.extraHeaders);
    if (creds.linearApiKey) {
      // Linear docs: "Authorization: <api-key>" — no Bearer prefix.
      headers["Authorization"] = creds.linearApiKey;
    }
  } else if (platform === "github") {
    const built = buildGithubPayload(payload);
    body = built.body;
    Object.assign(headers, built.extraHeaders);
    if (creds.githubToken) {
      headers["Authorization"] = `Bearer ${creds.githubToken}`;
    }
  } else if (platform === "splunk") {
    const built = buildSplunkPayload(payload);
    body = built.body;
    Object.assign(headers, built.extraHeaders);
    if (creds.splunkHecToken) {
      headers["Authorization"] = `Splunk ${creds.splunkHecToken}`;
    }
  } else if (platform === "asff") {
    const built = buildAsffPayload(payload, creds.awsAccountId, creds.awsRegion);
    body = built.body;
    Object.assign(headers, built.extraHeaders);
    // ASFF goes through a customer-managed relay (Lambda Function URL with
    // its own auth). We sign the body with the per-tenant signing key (or
    // env-var fallback) so the relay can verify provenance before calling
    // BatchImportFindings.
    applySignatureHeaders(headers, body, signingKeys.current, signingKeys.previous);
  } else if (platform === "sentinel") {
    const built = buildSentinelCefPayload(payload);
    body = built.body;
    // Sentinel CEF replaces Content-Type with text/plain — overwrite, don't merge.
    headers["Content-Type"] = built.extraHeaders["Content-Type"] ?? "text/plain";
    if (built.extraHeaders.Accept) headers["Accept"] = built.extraHeaders.Accept;
    applySignatureHeaders(headers, body, signingKeys.current, signingKeys.previous);
  } else if (platform === "ocsf") {
    const built = buildOcsfPayload(payload);
    body = built.body;
    Object.assign(headers, built.extraHeaders);
    // OCSF goes through a customer-managed ingester (Security Lake firehose,
    // Splunk HEC w/ OCSF add-on, etc.). Sign so the downstream can verify
    // provenance and reject spoofed events.
    applySignatureHeaders(headers, body, signingKeys.current, signingKeys.previous);
  } else {
    body = JSON.stringify(payload);
    applySignatureHeaders(headers, body, signingKeys.current, signingKeys.previous);
  }

  return { body, headers };
}

/**
 * Inline POST — used when Redis isn't configured or as the worker's
 * delivery primitive.  Throws on non-2xx so BullMQ retries kick in.
 */
export async function deliverWebhookInline(
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<void> {
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

export async function dispatchOne(
  url: string,
  payload: WebhookPayload,
  pdRoutingKey: string | null,
  creds: IntegrationCreds,
  signingKeys: SigningKeys,
): Promise<void> {
  const { body, headers } = buildBodyAndHeaders(url, payload, pdRoutingKey, creds, signingKeys);

  // Prefer the Redis-backed queue when available so failed deliveries
  // auto-retry and exhausted attempts land in the BullMQ failed set (DLQ).
  const queued = await enqueueWebhookDelivery({
    url,
    body,
    headers,
    scanId: payload.scanId,
    ...(payload.tenantId ? { tenantId: payload.tenantId } : {}),
  }).catch((err) => {
    console.error("[outbound-webhook] enqueue failed, falling back to inline:", err);
    return false;
  });
  if (queued) return;

  await deliverWebhookInline(url, body, headers);
}
