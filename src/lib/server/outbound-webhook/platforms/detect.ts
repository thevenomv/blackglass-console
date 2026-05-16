/**
 * Platform detection — inspects the outbound URL and returns a tag that
 * `dispatch.ts` uses to pick a payload builder + header set.
 *
 * Adding a new platform: add a regex test here, add a builder file, and
 * wire it into `dispatch.ts` (no other call sites).
 */

import type { Platform } from "../types";

export function detectPlatform(url: string): Platform {
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
  // OCSF (Open Cybersecurity Schema Framework) — the 2026 industry standard
  // for normalised security telemetry. Customers opt into the OCSF JSON
  // shape by suffixing their generic webhook URL with `/ocsf` (or by
  // configuring an OCSF-named ingestion endpoint). Targets: Amazon Security
  // Lake, Splunk OCSF add-on, Snowflake security data lake, OpenSearch
  // Security Analytics. Schema: Compliance Finding (class 2003).
  // Reference: https://schema.ocsf.io/2.0.0/classes/compliance_finding
  if (/(?:\/ocsf(?:$|[?\/])|ocsf-ingest|security-lake)/i.test(url)) return "ocsf";
  return "generic";
}
