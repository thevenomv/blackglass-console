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
import { getTenantNotifications } from "@/lib/server/services/notifications-service";
import { enqueueWebhookDelivery } from "@/lib/server/queue/webhook-queue";
import { shouldSkipForAirgap } from "@/lib/server/airgap";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SeverityLevel = "high" | "medium" | "low";

const SEVERITY_RANK: Record<SeverityLevel, number> = { high: 0, medium: 1, low: 2 };

type WebhookPayload = {
  event: "drift.detected";
  scanId: string;
  /** Saas tenant id. Omitted in legacy single-tenant deployments. */
  tenantId?: string;
  hostId: string;
  hostname: string;
  timestamp: string;
  /** Optional cap applied at dispatch — when set, indicates the original count of findings before truncation. */
  totalFindings?: number;
  findings: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    rationale: string;
  }>;
};

/** Maximum findings included per webhook payload — anything beyond is summarised. */
const MAX_PAYLOAD_FINDINGS = 50;

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

async function webhookUrls(tenantId: string | undefined): Promise<string[]> {
  const routing = await getTenantNotifications(tenantId);
  return routing.webhookUrls;
}

/**
 * Air-gap filter applied to a list of outbound URLs. In air-gapped
 * mode we strip any URL whose host isn't on the internal allow-list,
 * so a customer who accidentally configures a Slack webhook in an
 * air-gapped deployment doesn't block the rest of the dispatcher.
 */
function applyAirgapFilter(urls: string[]): string[] {
  return urls.filter((u) => !shouldSkipForAirgap("webhook", u));
}

function minSeverity(): SeverityLevel {
  const raw = (process.env.WEBHOOK_MIN_SEVERITY ?? "high").trim().toLowerCase();
  if (raw === "medium" || raw === "low") return raw;
  return "high";
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Inject HMAC-SHA256 signature header(s) onto an outbound request.  Caller
 * is responsible for the platform-specific body shape.
 *
 * - Always emits `X-Blackglass-Signature: sha256=<hex>` when the current
 *   signing key is set.
 * - Additionally emits `X-Blackglass-Signature-Previous: sha256=<hex>` when
 *   the previous key is still inside the rotation overlap window so
 *   receivers can verify against either key during the cutover.
 */
function applySignatureHeaders(
  headers: Record<string, string>,
  body: string,
  signingKey: string | null,
  previousSigningKey: string | null,
): void {
  if (signingKey) {
    headers["X-Blackglass-Signature"] = `sha256=${sign(body, signingKey)}`;
  }
  if (previousSigningKey) {
    headers["X-Blackglass-Signature-Previous"] = `sha256=${sign(body, previousSigningKey)}`;
  }
}

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Platform detection & native formatters
// ---------------------------------------------------------------------------

type Platform =
  | "slack"
  | "pagerduty"
  | "servicenow"
  | "jira"
  | "datadog"
  | "linear"
  | "github"
  | "splunk"
  | "asff"
  | "sentinel"
  | "generic";

function detectPlatform(url: string): Platform {
  if (/hooks\.slack\.com|slack\.com\/workflows/i.test(url)) return "slack";
  if (/events\.pagerduty\.com|pagerduty\.com\/v2/i.test(url)) return "pagerduty";
  if (/service-now\.com\/api\/now/i.test(url)) return "servicenow";
  if (/atlassian\.net\/rest\/api/i.test(url)) return "jira";
  if (/datadoghq\.(?:com|eu)\/api\//i.test(url)) return "datadog";
  if (/api\.linear\.app\/graphql/i.test(url)) return "linear";
  if (/api\.github\.com\/repos\//i.test(url)) return "github";
  // Splunk HEC: any URL containing "/services/collector" — covers Splunk Cloud,
  // Splunk Enterprise (port 8088), and HEC behind a proxy.
  if (/\/services\/collector(?:\/event)?(?:$|[?\/])/i.test(url)) return "splunk";
  // AWS Security Hub findings — customers point at a relay (Lambda Function URL,
  // API Gateway) since BatchImportFindings normally requires SigV4. The URL
  // path opts in by including "/asff" or "security-hub".
  if (/(?:\/asff(?:$|[?\/])|security-hub)/i.test(url)) return "asff";
  // Microsoft Sentinel via Logs Ingestion / Log Analytics workspace, or a CEF
  // forwarder relay. Either pattern produces CEF-formatted text.
  if (/(?:ods\.opinsights\.azure\.com|ingest\.monitor\.azure\.com|\/cef(?:$|[?\/]))/i.test(url)) {
    return "sentinel";
  }
  return "generic";
}

// ---------------------------------------------------------------------------
// Per-platform credential routing
// ---------------------------------------------------------------------------

interface IntegrationCreds {
  servicenowAuth: string | null;
  jiraAuth: string | null;
  jiraProjectKey: string | null;
  datadogApiKey: string | null;
  linearApiKey: string | null;
  linearTeamId: string | null;
  githubToken: string | null;
  splunkHecToken: string | null;
  awsAccountId: string | null;
  awsRegion: string | null;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.blackglasssec.com";

function highestSeverity(payload: WebhookPayload): "high" | "medium" | "low" {
  if (payload.findings.some((f) => f.severity === "high")) return "high";
  if (payload.findings.some((f) => f.severity === "medium")) return "medium";
  return "low";
}

function summaryLine(payload: WebhookPayload): string {
  const high = payload.findings.filter((f) => f.severity === "high").length;
  return `BLACKGLASS: ${payload.findings.length} drift finding${payload.findings.length === 1 ? "" : "s"} on ${payload.hostname}${high > 0 ? ` (${high} high)` : ""}`;
}

function findingsMarkdown(payload: WebhookPayload, max = 10): string {
  const lines = payload.findings.slice(0, max).map((f) => `- **[${f.severity.toUpperCase()}]** ${f.title} _(${f.category})_ — ${f.rationale}`);
  if (payload.findings.length > max) {
    lines.push(`- _…and ${payload.findings.length - max} more findings._`);
  }
  return lines.join("\n");
}

function findingsPlainText(payload: WebhookPayload, max = 10): string {
  const lines = payload.findings.slice(0, max).map((f) => `[${f.severity.toUpperCase()}] ${f.title} (${f.category}) — ${f.rationale}`);
  if (payload.findings.length > max) {
    lines.push(`…and ${payload.findings.length - max} more findings.`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// ServiceNow — POST /api/now/table/incident
// Auth: Basic <base64(user:password)>
// Body: { short_description, description, urgency, impact, ... }
// Reference: https://developer.servicenow.com/dev.do
// ---------------------------------------------------------------------------
function buildServiceNowPayload(
  payload: WebhookPayload,
): { body: string; extraHeaders: Record<string, string> } {
  const sev = highestSeverity(payload);
  // ServiceNow incident scale: 1 = high, 2 = medium, 3 = low
  const urgency = sev === "high" ? 1 : sev === "medium" ? 2 : 3;
  return {
    body: JSON.stringify({
      short_description: summaryLine(payload),
      description:
        `${summaryLine(payload)}\n\n` +
        `Host: ${payload.hostname}\n` +
        `Scan: ${payload.scanId}\n` +
        `Detected: ${payload.timestamp}\n\n` +
        `Findings:\n${findingsPlainText(payload)}\n\n` +
        `Review: ${APP_URL}/drift`,
      urgency: String(urgency),
      impact: String(urgency),
      category: "Security",
      subcategory: "Configuration drift",
      caller_id: "blackglass.bot",
      // dedupe via correlation_id so a re-run of the same scan updates the same incident
      correlation_id: `blackglass-${payload.scanId}-${payload.hostId}`,
      correlation_display: "BLACKGLASS drift scan",
    }),
    extraHeaders: { Accept: "application/json" },
  };
}

// ---------------------------------------------------------------------------
// Jira — POST /rest/api/3/issue
// Auth: Basic <base64(email:api_token)>
// Body: { fields: { project, issuetype, summary, description (ADF), priority, labels } }
// Reference: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
// ---------------------------------------------------------------------------
function buildJiraPayload(
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
          { type: "text", text: "Review in BLACKGLASS: " },
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

// ---------------------------------------------------------------------------
// Datadog Events API — POST /api/v1/events
// Auth: DD-API-KEY header
// Body: { title, text, alert_type, priority, host, tags, aggregation_key }
// Reference: https://docs.datadoghq.com/api/latest/events/#post-an-event
// ---------------------------------------------------------------------------
function buildDatadogPayload(
  payload: WebhookPayload,
): { body: string; extraHeaders: Record<string, string> } {
  const sev = highestSeverity(payload);
  const alertType = sev === "high" ? "error" : sev === "medium" ? "warning" : "info";
  return {
    body: JSON.stringify({
      title: summaryLine(payload),
      text:
        `%%%\n` +
        `${findingsMarkdown(payload)}\n\n` +
        `[Review in BLACKGLASS](${APP_URL}/drift)\n` +
        `%%%`,
      alert_type: alertType,
      priority: sev === "high" ? "normal" : "low",
      host: payload.hostname,
      tags: [
        "service:blackglass",
        `severity:${sev}`,
        `scan_id:${payload.scanId}`,
        `host_id:${payload.hostId}`,
      ],
      aggregation_key: `blackglass-${payload.hostId}`,
      source_type_name: "BLACKGLASS",
    }),
    extraHeaders: { Accept: "application/json" },
  };
}

// ---------------------------------------------------------------------------
// Linear — POST /graphql, mutation issueCreate
// Auth: Authorization: <api-key>  (no "Bearer" prefix per Linear docs)
// Reference: https://developers.linear.app/docs/graphql/working-with-the-graphql-api
// ---------------------------------------------------------------------------
function buildLinearPayload(
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
    `[Review in BLACKGLASS](${APP_URL}/drift)`;
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

// ---------------------------------------------------------------------------
// GitHub Issues — POST /repos/{owner}/{repo}/issues
// Auth: Authorization: Bearer <token>; X-GitHub-Api-Version: 2022-11-28
// Reference: https://docs.github.com/en/rest/issues/issues#create-an-issue
// ---------------------------------------------------------------------------
function buildGithubPayload(
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
        `[Review in BLACKGLASS](${APP_URL}/drift)`,
      labels: ["blackglass", `severity:${sev}`],
    }),
    extraHeaders: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  };
}

// ---------------------------------------------------------------------------
// Splunk HEC — POST /services/collector/event
// Auth: Authorization: Splunk <hec-token>
// Body: { event, sourcetype, source, host, time }
// HEC accepts multiple events concatenated as a stream; we send one event per
// host scan to stay compatible with the simpler "raw event" mode.
// Reference: https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector
// ---------------------------------------------------------------------------
function buildSplunkPayload(
  payload: WebhookPayload,
): { body: string; extraHeaders: Record<string, string> } {
  const epoch = Math.floor(new Date(payload.timestamp).getTime() / 1000);
  return {
    body: JSON.stringify({
      time: epoch,
      host: payload.hostname,
      source: `blackglass:${payload.hostId}`,
      sourcetype: "blackglass:drift",
      index: process.env.SPLUNK_HEC_INDEX?.trim() || "main",
      event: {
        event: payload.event,
        scanId: payload.scanId,
        tenantId: payload.tenantId,
        hostId: payload.hostId,
        hostname: payload.hostname,
        severity: highestSeverity(payload),
        totalFindings: payload.totalFindings ?? payload.findings.length,
        findings: payload.findings,
        review_url: `${APP_URL}/drift`,
      },
    }),
    extraHeaders: { Accept: "application/json" },
  };
}

// ---------------------------------------------------------------------------
// AWS Security Hub — ASFF (AWS Security Finding Format)
// Customers route through a Lambda Function URL / API Gateway that calls
// BatchImportFindings server-side (since SigV4 is impractical here). We
// produce ASFF-shaped findings — one per drift event — wrapped in a list.
// Reference: https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-findings-format.html
// ---------------------------------------------------------------------------
function buildAsffPayload(
  payload: WebhookPayload,
  awsAccountId: string | null,
  awsRegion: string | null,
): { body: string; extraHeaders: Record<string, string> } {
  const region = awsRegion ?? "us-east-1";
  const account = awsAccountId ?? "000000000000";
  // ASFF severity normalized 0–100 — map our 3 levels into Security Hub buckets.
  const sevMap: Record<string, { Label: string; Normalized: number }> = {
    high: { Label: "HIGH", Normalized: 70 },
    medium: { Label: "MEDIUM", Normalized: 40 },
    low: { Label: "LOW", Normalized: 10 },
  };
  const findings = payload.findings.map((f) => {
    const sev = sevMap[f.severity] ?? sevMap.low;
    return {
      SchemaVersion: "2018-10-08",
      // Stable Id — same finding rehydrates the same Security Hub record.
      Id: `blackglass/${payload.scanId}/${payload.hostId}/${f.id}`,
      ProductArn: `arn:aws:securityhub:${region}:${account}:product/${account}/default`,
      GeneratorId: `blackglass-${f.category}`,
      AwsAccountId: account,
      Types: [`Software and Configuration Checks/Industry and Regulatory Standards/${f.category}`],
      CreatedAt: payload.timestamp,
      UpdatedAt: payload.timestamp,
      Severity: sev,
      Title: f.title,
      Description: f.rationale,
      Resources: [
        {
          Type: "Other",
          Id: `blackglass:host:${payload.hostId}`,
          Partition: "aws",
          Region: region,
          Details: { Other: { hostname: payload.hostname, scanId: payload.scanId } },
        },
      ],
      SourceUrl: `${APP_URL}/drift?host=${encodeURIComponent(payload.hostId)}`,
      RecordState: "ACTIVE",
      Workflow: { Status: "NEW" },
      ProductFields: { "blackglass/category": f.category, "blackglass/scanId": payload.scanId },
    };
  });
  return {
    body: JSON.stringify({ Findings: findings }),
    extraHeaders: { Accept: "application/json" },
  };
}

// ---------------------------------------------------------------------------
// Microsoft Sentinel — CEF (Common Event Format) over HTTP
// CEF is a single line per event in the form:
//   CEF:0|Vendor|Product|Version|SignatureID|Name|Severity|Extension
// Multiple events are newline-separated. Sent as text/plain so a Sentinel CEF
// connector or relay can ingest without further transform.
// Reference: https://learn.microsoft.com/en-us/azure/sentinel/connect-cef-syslog
// ---------------------------------------------------------------------------
function escapeCefHeader(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function escapeCefExtension(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/=/g, "\\=").replace(/\r?\n/g, "\\n");
}

function buildSentinelCefPayload(
  payload: WebhookPayload,
): { body: string; extraHeaders: Record<string, string> } {
  // CEF severity scale is 0–10. Map our levels into that range.
  const sevNum: Record<string, number> = { high: 9, medium: 6, low: 3 };
  const epochMs = new Date(payload.timestamp).getTime();
  const lines = payload.findings.map((f) => {
    const sig = `BLACKGLASS-${f.category.toUpperCase()}`;
    const ext = [
      `rt=${epochMs}`,
      `dvchost=${escapeCefExtension(payload.hostname)}`,
      `dvcid=${escapeCefExtension(payload.hostId)}`,
      `cs1Label=ScanId cs1=${escapeCefExtension(payload.scanId)}`,
      `cs2Label=Category cs2=${escapeCefExtension(f.category)}`,
      `cs3Label=ReviewUrl cs3=${escapeCefExtension(`${APP_URL}/drift`)}`,
      `msg=${escapeCefExtension(f.rationale)}`,
    ].join(" ");
    return `CEF:0|BLACKGLASS|BLACKGLASS|1.0|${escapeCefHeader(sig)}|${escapeCefHeader(f.title)}|${sevNum[f.severity] ?? 3}|${ext}`;
  });
  return {
    body: lines.join("\n") + "\n",
    extraHeaders: { "Content-Type": "text/plain", Accept: "*/*" },
  };
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
function buildPagerDutyPayload(payload: WebhookPayload, pdRoutingKey: string | null): string {
  const highCount = payload.findings.filter((f) => f.severity === "high").length;
  const severity = highCount > 0 ? "critical" : payload.findings.some((f) => f.severity === "medium") ? "warning" : "info";
  const summary = `BLACKGLASS: ${payload.findings.length} drift finding(s) on ${payload.hostname}`;

  return JSON.stringify({
    routing_key: pdRoutingKey ?? "",
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

/**
 * Per-tenant signing keys for outbound webhook HMAC signatures.  Passed
 * alongside the body builder so the dispatcher can swap them per tenant
 * without touching the env vars.
 */
interface SigningKeys {
  current: string | null;
  previous: string | null;
}

function buildBodyAndHeaders(
  url: string,
  payload: WebhookPayload,
  pdRoutingKey: string | null,
  creds: IntegrationCreds,
  signingKeys: SigningKeys = { current: null, previous: null },
): { body: string; headers: Record<string, string> } {
  const platform = detectPlatform(url);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "BLACKGLASS-Webhook/1.0",
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

async function dispatchOne(
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

// Drop unused webhookUrls() helper — kept exported only for backwards compat
// with any caller that still imports it; resolves to env-only routing when
// invoked without a tenant context.
export { webhookUrls };

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
};

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
          "This is a synthetic BLACKGLASS test event — no action required.",
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
