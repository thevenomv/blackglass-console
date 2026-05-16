/**
 * Per-platform payload builders.
 *
 * Each builder is a pure function over `WebhookPayload` (+ any required
 * credentials).  `dispatch.ts` picks one based on `detectPlatform(url)`.
 */

export { detectPlatform } from "./detect";
export {
  highestSeverity,
  summaryLine,
  findingsMarkdown,
  findingsPlainText,
  severityEmoji,
} from "./format";

export { buildServiceNowPayload } from "./servicenow";
export { buildJiraPayload } from "./jira";
export { buildDatadogPayload } from "./datadog";
export { buildLinearPayload } from "./linear";
export { buildGithubPayload } from "./github";
export { buildSplunkPayload } from "./splunk";
export { buildAsffPayload } from "./asff";
export { buildSentinelCefPayload } from "./sentinel";
export { buildOcsfPayload } from "./ocsf";
export { buildSlackPayload } from "./slack";
export { buildPagerDutyPayload } from "./pagerduty";
