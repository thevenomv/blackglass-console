/**
 * Shared types + constants for the outbound webhook dispatcher.
 *
 * Pure type definitions only — must not import any platform builder, the
 * dispatch path, or anything with side effects.  Keeping this file leaf-only
 * lets the per-platform modules and tests import from it without pulling in
 * the queue / fetch / signing layer.
 */

export type SeverityLevel = "high" | "medium" | "low";

export const SEVERITY_RANK: Record<SeverityLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export type WebhookPayload = {
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
export const MAX_PAYLOAD_FINDINGS = 50;

export type Platform =
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
  | "ocsf"
  | "generic";

export interface IntegrationCreds {
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

/**
 * Per-tenant signing keys for outbound webhook HMAC signatures.  Passed
 * alongside the body builder so the dispatcher can swap them per tenant
 * without touching the env vars.
 */
export interface SigningKeys {
  current: string | null;
  previous: string | null;
}

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://app.blackglasssec.com";
